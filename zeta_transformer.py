import argparse
import json
import sys
import math
import os
import time
import hashlib
import numpy as np
from mpmath import mp

# -----------------------------------------------------------------------------
# CONSTANTS & GLOBAL CONFIG
# -----------------------------------------------------------------------------

mp.dps = 50  # Default, can be overridden by config

TAU = 2 * mp.pi

# -----------------------------------------------------------------------------
# 1. LENS REGISTRY (Input, Output, Display)
# -----------------------------------------------------------------------------

class LensRegistry:
    # --- Input Lenses (s-plane transformations) ---
    # s = sigma + i*t
    
    @staticmethod
    def input_identity(s, params):
        return s

    @staticmethod
    def input_scale_imag(s, params):
        """s' = sigma + i * (t * factor)"""
        factor = params.get('factor', 1.0)
        return mp.mpc(s.real, s.imag * factor)

    @staticmethod
    def input_scale_about_critical(s, params):
        """s' = 0.5 + (sigma-0.5)*factor + i * (t*factor)"""
        factor = params.get('factor', 1.0)
        return mp.mpc(0.5 + (s.real - 0.5) * factor, s.imag * factor)

    @staticmethod
    def input_translate_real(s, params):
        """s' = (sigma + shift) + i*t"""
        shift = params.get('shift', 0.0)
        return mp.mpc(s.real + shift, s.imag)

    @staticmethod
    def input_conjugate(s, params):
        """s' = conj(s)"""
        return mp.conj(s)
    
    # --- Output Lenses (w-plane transformations BEFORE display) ---
    # w = zeta(s')
    
    @staticmethod
    def output_identity(w, params):
        return w

    @staticmethod
    def output_scale_magnitude(w, params):
        """w' = w * factor"""
        factor = params.get('factor', 1.0)
        return w * factor

    # --- Display Lenses (Visual Projections) ---
    # Final mapping to 2D for rendering. 
    # Must handle Infinity/NaN gracefully if possible, or we let the point be None.
    
    @staticmethod
    def display_identity(w, params):
        return w

    @staticmethod
    def display_mobius_unit_disk(w, params):
        """w' = w / (1 + |w|)"""
        # Conformal-ish compression to unit disk
        try:
            mag = abs(w)
            if mag == 0: return w
            return w / (1 + mag)
        except:
            return mp.nan

    @staticmethod
    def display_signed_log_radius(w, params):
        """w' = log(1 + |w|) * e^{i*arg(w)}"""
        # Compresses large magnitudes logarithmically, preserves phase
        try:
            mag = abs(w)
            if mag == 0: return w
            # mpmath log can be slow, but accurate
            # We want radius = log(1 + r)
            new_r = mp.log(1 + mag)
            return w * (new_r / mag) # Rescale w to new radius
        except:
            return mp.nan

    @staticmethod
    def display_clamp_radius(w, params):
        """Clamps magnitude to max_r"""
        max_r = params.get('max_r', 10.0)
        try:
            mag = abs(w)
            if mag > max_r:
                return w * (max_r / mag)
            return w
        except:
            return mp.nan

    # --- Dispatcher ---
    @staticmethod
    def get_lens(type_category, name):
        method_name = f"{type_category}_{name}"
        if hasattr(LensRegistry, method_name):
            return getattr(LensRegistry, method_name)
        raise ValueError(f"Unknown lens: {type_category}.{name}")

# -----------------------------------------------------------------------------
# 2. TAU SCALING MODES
# -----------------------------------------------------------------------------

class TauScalingManager:
    """
    Manages the interpretation of 'k' and 'tau' into lens parameters.
    """
    
    MODE_COORDINATE_REPARAM = "coordinate_reparam" # Mode 1: Units change (t' = t / tau^k)
    MODE_DOMAIN_DEFORMATION = "domain_deformation" # Mode 2: Sampling different points (t' = t * tau^k)
    MODE_ANCHORED = "anchored_scaling"             # Mode 3: Scaling around 0.5 (s' = 0.5 + (s-0.5)/tau^k)
    
    @staticmethod
    def resolve_config(mode, k, tau=TAU):
        """
        Returns (input_lens_name, input_params, output_lens_name, output_params)
        based on the high-level Tau Mode.
        """
        scale = mp.power(tau, k)
        inv_scale = 1.0 / scale
        
        if mode == TauScalingManager.MODE_COORDINATE_REPARAM:
            # We want to graph vs T, where T = tau^k * t. 
            # If the input t is interpreted as T, then the actual t passed to Zeta should be T / tau^k.
            return ("scale_imag", {"factor": float(inv_scale)}, "identity", {})
            
        elif mode == TauScalingManager.MODE_DOMAIN_DEFORMATION:
            # We keep graph t fixed, but we evaluate Zeta at (tau^k * t).
            return ("scale_imag", {"factor": float(scale)}, "identity", {})
            
        elif mode == TauScalingManager.MODE_ANCHORED:
            # Scale around 0.5: s' = 0.5 + (x/tau^k) + i(t/tau^k)
            return ("scale_about_critical", {"factor": float(inv_scale)}, "identity", {})

        # Default fallback
        return ("identity", {}, "identity", {})

# -----------------------------------------------------------------------------
# 3. CORE MATH & UTILS
# -----------------------------------------------------------------------------

def safe_zeta(s, eps_pole=1e-6, cap_mag=1e6):
    if abs(s - 1) < eps_pole:
        return mp.nan, False
    try:
        w = mp.zeta(s)
        if abs(w) > cap_mag:
            return w, False
        if mp.isnan(w.real) or mp.isnan(w.imag):
            return mp.nan, False
        return w, True
    except:
        return mp.nan, False

def c_to_list(c):
    try:
        if isinstance(c, (int, float)):
            if math.isinf(c) or math.isnan(c): return None
            return [float(c), 0.0]
        r, i = float(c.real), float(c.imag)
        if math.isinf(r) or math.isnan(r) or math.isinf(i) or math.isnan(i):
            return None
        return [r, i]
    except:
        return None # Fallback Instead of [0.0, 0.0] which is a valid point

def get_config_hash(config):
    s = json.dumps(config, sort_keys=True)
    return hashlib.sha256(s.encode('utf-8')).hexdigest()[:12]

# -----------------------------------------------------------------------------
# 4. BAKING ENGINE
# -----------------------------------------------------------------------------

class BakingEngine:
    def __init__(self):
        pass

    def bake(self, config, out_dir):
        # 1. Setup Precision
        mp.dps = config.get("dps", 50)
        
        # 2. Resolve Lenses
        tau_mode = config.get("tau_mode", "coordinate_reparam")
        k = config.get("k", 0)
        
        # Helper to get lenses
        in_name, in_params, out_name, out_params = TauScalingManager.resolve_config(tau_mode, k)
        
        # Overrides? (If config explicitly specifies lenses, use those)
        if "input_lens" in config:
            in_name = config["input_lens"]
            in_params = config.get("input_params", {})
        if "output_lens" in config:
            out_name = config["output_lens"]
            out_params = config.get("output_params", {})
            
        display_name = config.get("display_lens", "identity")
        display_params = config.get("display_params", {})
        
        # Instantiate Lenses
        lens_in = LensRegistry.get_lens("input", in_name)
        lens_out = LensRegistry.get_lens("output", out_name)
        lens_disp = LensRegistry.get_lens("display", display_name)
        
        dataset = {
            "schema_version": "1.0",
            "dataset_id": get_config_hash(config),
            "config": config,
            "resolved_lenses": {
                "input": {"name": in_name, "params": {k: float(v) for k,v in in_params.items()}},
                "output": {"name": out_name, "params": {k: float(v) for k,v in out_params.items()}},
                "display": {"name": display_name, "params": {k: float(v) for k,v in display_params.items()}}
            },
            "layers": {},
            "validation": {}
        }
        
        print(f"Baking Dataset {dataset['dataset_id']} (Mode: {tau_mode}, k={k})...")
        
        # 3. Generate Layers
        
        # Shared Ranges
        t_min, t_max = config.get("t_range", [0, 60])
        sigma_min, sigma_max = config.get("sigma_range", [-10, 10])
        grid_h = config.get("grid_h", 10) # imaginary grid lines
        grid_v = config.get("grid_v", 10) # real grid lines
        steps = config.get("steps", 200)

        # Helper to dynamically transform a polyline with adaptive subdivision, returning 1-1 matched pairs
        def generate_matched_polyline(s_pts):
            def eval_pair(s):
                s_prime = lens_in(s, in_params)
                d_final = s_prime # Keep domain purely as the input parameter space mapping
                
                w, valid = safe_zeta(s_prime)
                if not valid and (mp.isnan(w.real) or mp.isnan(w.imag)): 
                    w_final = None
                else:
                    w_prime = lens_out(w, out_params)
                    w_final = lens_disp(w_prime, display_params)
                    if mp.isnan(w_final.real) or mp.isnan(w_final.imag) or mp.isinf(w_final.real) or mp.isinf(w_final.imag): 
                        w_final = None
                return d_final, w_final

            def distance(w1, w2):
                if w1 is None or w2 is None: return float('inf')
                return float(abs(w1 - w2))

            def subdivide(s1, d1, w1, s2, d2, w2, depth, max_depth=3, tol=0.2):
                if depth >= max_depth: return []
                dist = distance(w1, w2)
                if dist > tol or dist == float('inf'):
                    s_mid = mp.mpc((s1.real + s2.real) / 2, (s1.imag + s2.imag) / 2)
                    d_mid, w_mid = eval_pair(s_mid)
                    left = subdivide(s1, d1, w1, s_mid, d_mid, w_mid, depth + 1, max_depth, tol)
                    right = subdivide(s_mid, d_mid, w_mid, s2, d2, w2, depth + 1, max_depth, tol)
                    return left + [(s_mid, d_mid, w_mid)] + right
                return []

            if not s_pts: return [], []

            results = []
            prev_s = s_pts[0]
            prev_d, prev_w = eval_pair(prev_s)
            results.append((prev_s, prev_d, prev_w))
            
            for s in s_pts[1:]:
                d, w = eval_pair(s)
                subs = subdivide(prev_s, prev_d, prev_w, s, d, w, 0)
                results.extend(subs)
                results.append((s, d, w))
                prev_s = s
                prev_d = d
                prev_w = w
                
            domain_pts = [c_to_list(d) if d is not None else None for (_, d, _) in results]
            image_pts = [c_to_list(w) if w is not None else None for (_, _, w) in results]
            return domain_pts, image_pts
            
        # --- Stage A & B: Grids ---
        print("  Generating Grids (Domain + Warped Image)...")
        domain_lines = []
        image_lines = []
        
        # Vertical lines (constant sigma)
        if grid_v > 0:
            for s_val in np.linspace(sigma_min, sigma_max, grid_v):
                pts = [mp.mpc(s_val, t) for t in np.linspace(t_min, t_max, steps)]
                d_pts, i_pts = generate_matched_polyline(pts)
                domain_lines.append(d_pts)
                image_lines.append(i_pts)
                
        # Horizontal lines (constant t)
        if grid_h > 0:
            for t_val in np.linspace(t_min, t_max, grid_h):
                pts = [mp.mpc(sigma, t_val) for sigma in np.linspace(sigma_min, sigma_max, steps)]
                d_pts, i_pts = generate_matched_polyline(pts)
                domain_lines.append(d_pts)
                image_lines.append(i_pts)
                
        dataset["layers"]["domain_grid"] = domain_lines
        dataset["layers"]["image_grid"] = image_lines
        
        # --- Stage C: Continuous Critical Line ---
        print("  Generating Critical Line Image...")
        crit_pts = [mp.mpc(0.5, t) for t in np.linspace(t_min, t_max, steps*2)]
        d_crit, i_crit = generate_matched_polyline(crit_pts)
        dataset["layers"]["critical_line_domain"] = d_crit
        dataset["layers"]["critical_line_image"] = i_crit

        # --- Stage D: Segmented Critical Line & Zeros ---
        print("  Generating Stage D (Segments + Zeros)...")
        
        zeros = []
        t_search_max = max(abs(t_min), abs(t_max)) * 2 + 50 # Broaden bounds in case of tau^k
        n = 1
        while True:
            z_n = mp.zetazero(n)
            gamma = float(z_n.imag)
            if gamma > t_search_max: break
            zeros.append(gamma)
            if t_min < 0: zeros.append(-gamma)
            n += 1
            if n > 10000: break # Safety cap
            
        zeros.sort()
        
        # We will iterate through known zeros and see if they map to t-range.
        # Let's find the parameter t_0 such that Im(InputLens(0.5 + i*t_0)) == gamma
        zero_events = []
        for gamma in zeros:
            scale_factor = 1.0
            if tau_mode == TauScalingManager.MODE_COORDINATE_REPARAM:
                 scale_factor = float(in_params.get("factor", 1.0))
            elif tau_mode == TauScalingManager.MODE_DOMAIN_DEFORMATION:
                 scale_factor = float(in_params.get("factor", 1.0))
            elif tau_mode == TauScalingManager.MODE_ANCHORED:
                 scale_factor = float(in_params.get("factor", 1.0))
            
            predicted_t = gamma / scale_factor
            
            if t_min <= predicted_t <= t_max:
                s_z = mp.mpc(0.5, predicted_t)
                s_prime = lens_in(s_z, in_params)
                w_z, _ = safe_zeta(s_prime)
                w_out = lens_out(w_z, out_params)
                w_disp = lens_disp(w_out, display_params)
                zero_events.append({
                    "t": float(predicted_t),
                    "gamma": float(gamma),
                    "w": c_to_list(w_disp)
                })

        segments = []
        # Create standard uniformly split segments for colored rendering
        num_segments = 50
        seg_bounds = np.linspace(t_min, t_max, num_segments+1)
        for i in range(num_segments):
            t0, t1 = seg_bounds[i], seg_bounds[i+1]
            seg_pts = [mp.mpc(0.5, t) for t in np.linspace(t0, t1, 10)]
            d_seg, i_seg = generate_matched_polyline(seg_pts)
            segments.append({
                "t_start": float(t0),
                "t_end": float(t1),
                "points": i_seg,         # Provide the image points
                "domain_points": d_seg   # Provide the corresponding domain points!
            })
                
        dataset["layers"]["critical_line_segments"] = segments
        dataset["layers"]["zero_events"] = zero_events
        
        # 4. Validation
        print("  Running Validation...")
        dataset["validation"] = self.validate(config, lens_in, in_params, tau_mode, k)
        
        # 5. Write to Disk
        if not os.path.exists(out_dir):
            os.makedirs(out_dir)
            
        fname = f"{dataset['dataset_id']}.json"
        fpath = os.path.join(out_dir, fname)
        
        with open(fpath, 'w') as f:
            json.dump(dataset, f)
            
        return dataset

    def validate(self, config, lens_in, in_params, tau_mode, k):
        results = {
            "zeros": [],
            "symmetry_check": {}
        }
        
        tolerance = 10**(-mp.dps/2 + 5)
        
        # A) Zero Check & Tau Mapping
        for n in [1, 2, 3]:
            z = mp.zetazero(n)
            gamma = float(z.imag)
            
            # For Mode 1: t parameter is T = tau^k * gamma mapping to zeta(0.5 + i*gamma)
            scale_factor = float(in_params.get("factor", 1.0))
            predicted_t = gamma / scale_factor
            
            s = mp.mpc(0.5, predicted_t)
            s_prime = lens_in(s, in_params)
            w, _ = safe_zeta(s_prime)
            
            mag = float(abs(w))
            passed = mag < tolerance
            
            results["zeros"].append({
                "n": n,
                "gamma": gamma,
                "predicted_t": float(predicted_t),
                "s_prime": str(s_prime),
                "zeta_mag": mag,
                "pass": passed
            })
            
        # B) Symmetry Check
        # Check conjugate symmetry: zeta(conj(s)) == conj(zeta(s))
        s_sym = mp.mpc(0.7, 14.0)
        s_prime = lens_in(s_sym, in_params)
        w, _ = safe_zeta(s_prime)
        
        s_conj = mp.conj(s_sym)
        s_prime_conj = lens_in(s_conj, in_params)
        w_conj, _ = safe_zeta(s_prime_conj)
        
        diff_mag = float(abs(w_conj - mp.conj(w)))
        passed_sym = diff_mag < tolerance
        
        results["symmetry_check"] = {
            "s": str(s_sym),
            "w": str(w),
            "w_conj_computed": str(w_conj),
            "conj_w": str(mp.conj(w)),
            "diff_mag": diff_mag,
            "pass": passed_sym
        }
        
        return results

# -----------------------------------------------------------------------------
# 5. CLI
# -----------------------------------------------------------------------------

def bake_defaults_cmd(out_dir):
    engine = BakingEngine()
    manifest = {"datasets": []}
    
    # We enforce a display projection like `signed_log_radius` to contain Zeta values 
    # visually, ensuring the graphics don't blow out of bounds.
    
    # 1. Baseline (k=0, Identity)
    conf_base = {
        "tau_mode": TauScalingManager.MODE_COORDINATE_REPARAM,
        "k": 0,
        "t_range": [0, 60],
        "sigma_range": [-2, 3],
        "grid_v": 6,
        "grid_h": 31,
        "steps": 100,
        "display_lens": "signed_log_radius"
    }
    ds = engine.bake(conf_base, out_dir)
    manifest["datasets"].append(ds["dataset_id"])
    
    # 2. k=1 (Reparam) - "Zoomed Out" in t-values, but curve shape same
    conf_k1 = conf_base.copy()
    conf_k1["k"] = 1
    # Adjust t range to account for scaling units: t_new = t_old * tau
    tau_f = float(TAU)
    conf_k1["t_range"] = [0, 60 * tau_f]
    ds = engine.bake(conf_k1, out_dir)
    manifest["datasets"].append(ds["dataset_id"])

    # 3. k=1 (Domain Scaling) - "Zoomed In" / Sampling different part
    conf_k1_dom = conf_base.copy()
    conf_k1_dom["tau_mode"] = TauScalingManager.MODE_DOMAIN_DEFORMATION
    conf_k1_dom["k"] = 1
    ds = engine.bake(conf_k1_dom, out_dir)
    manifest["datasets"].append(ds["dataset_id"])
    
    # 4. k=1 (Anchored) - "Zoomed In" around critical line
    conf_ank = conf_base.copy()
    conf_ank["tau_mode"] = TauScalingManager.MODE_ANCHORED
    conf_ank["k"] = 1
    ds = engine.bake(conf_ank, out_dir)
    manifest["datasets"].append(ds["dataset_id"])

    # Write Manifest
    with open(os.path.join(out_dir, "manifest.json"), 'w') as f:
        json.dump(manifest, f, indent=2)

def main():
    parser = argparse.ArgumentParser(description="Zeta Baker v2")
    subparsers = parser.add_subparsers(dest="command")
    
    # bake
    p_bake = subparsers.add_parser("bake")
    p_bake.add_argument("--config", required=True)
    p_bake.add_argument("--out", required=True)
    
    # bake-defaults
    p_defs = subparsers.add_parser("bake-defaults")
    p_defs.add_argument("--out", required=True)
    
    # validate
    p_val = subparsers.add_parser("validate")
    p_val.add_argument("--dataset", required=True)

    args = parser.parse_args()
    
    if args.command == "bake":
        with open(args.config, 'r') as f:
            cfg = json.load(f)
        engine = BakingEngine()
        engine.bake(cfg, args.out)
        
    elif args.command == "bake-defaults":
        bake_defaults_cmd(args.out)
        
    elif args.command == "validate":
        with open(args.dataset, 'r') as f:
            data = json.load(f)
        print(json.dumps(data.get("validation", {}), indent=2))
        
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
