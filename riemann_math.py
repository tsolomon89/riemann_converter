import mpmath
import os
import json
import math

# -----------------------------------------------------------------------------
# MASTER CONFIGURATION
# -----------------------------------------------------------------------------
mpmath.mp.dps = 50   # Default
ZERO_COUNT = 20000  # Default number of zeros to compute
PRECISION = 50    # Default Decimal places of precision
PRIMES_FILE = "agent_context/primes.csv"
OUTPUT_FILE = "dashboard/public/experiments.json"
ZEROS_FILE = "agent_context/zeros.dat"
TAU = 2 * mpmath.pi

def configure(dps=50, zero_count=20000):
    global PRECISION, ZERO_COUNT, TAU
    mpmath.mp.dps = dps
    PRECISION = dps
    ZERO_COUNT = zero_count
    TAU = 2 * mpmath.pi # Recompute TAU with new precision
    print(f"  [Math Config] Precision: {dps} DPS, Zeros: {zero_count}")

# -----------------------------------------------------------------------------
# DATA LOADERS
# -----------------------------------------------------------------------------

def get_primes(max_val):
    """
    Returns a list of pure primes up to max_val.
    Used for the TruePi step function.
    Reads from agent_context/primes.csv.
    """
    print(f"Loading primes (target max_val={max_val})...")
    primes = []
    
    # User requested at least 100,000 primes context
    # We will read until we exceed max_val AND have reasonable count, or EOF
    MIN_PRIME_COUNT = 100000 
    
    if os.path.exists(PRIMES_FILE):
        try:
            with open(PRIMES_FILE, "r") as f:
                for line in f:
                    p = int(line.strip())
                    primes.append(p)
                    
                    # Stop if we have enough primes AND we are past the requested value
                    # (We keep reading to hit MIN_PRIME_COUNT to satisfy user request)
                    if p > max_val and len(primes) > MIN_PRIME_COUNT:
                        break
                        
            print(f"  > Loaded {len(primes)} primes from file (Max: {primes[-1]}).")
            return primes
        except Exception as e:
            print(f"  > Error reading primes file: {e}. Falling back to sieve.")

    # Fallback to Sieve if file missing/broken
    print(f"  > Generating primes via sieve...")
    limit = int(max_val) + 1000 # Buffer
    sieve = [True] * limit
    for i in range(2, int(limit**0.5) + 1):
        if sieve[i]:
            for j in range(i*i, limit, i):
                sieve[j] = False
    
    primes = [i for i in range(2, limit) if sieve[i]]
    print(f"  > Generated {len(primes)} primes.")
    return primes

def get_zeros(n, source="generated"):
    """
    Returns first n imaginary parts of Riemann zeros (gammas).
    source: "generated" (default), or "file:<path>"
    """
    gammas = []
    
    # Handle File Source
    if source.startswith("file:"):
        path = source.split("file:")[1]
        print(f"Loading zeros from external file: {path}...")
        if not os.path.exists(path):
            print(f"  > ERROR: File not found: {path}!")
            return []
            
        try:
            # Detect format based on extension or content
            # Odlyzko files often have one zero per line, sometimes with index
            # customized parsing might be needed.
            # For now assuming one float per line
            import gzip
            opener = gzip.open if path.endswith(".gz") else open
            
            with opener(path, "rt") as f:
                count = 0
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"): continue
                    try:
                        # naive parse: first token is the zero?
                        # Odlyzko: "   1  14.134..."
                        parts = line.split()
                        if not parts: continue
                        
                        # heuristic: look for the float that looks like a gamma
                        # usually the last one or the only one?
                        # Odlyzko standard: index, gamma
                        val_str = parts[-1] 
                        val = mpmath.mpf(val_str)
                        gammas.append(val)
                        count += 1
                        if count >= n: break
                    except:
                        pass
            print(f"  > Loaded {len(gammas)} zeros from {path}.")
            return gammas
        except Exception as e:
            print(f"  > Error reading zero file: {e}")
            return []

    # 1. Try to load from cache (Default Generated)
    if os.path.exists(ZEROS_FILE):
        print(f"Loading cached zeros from {ZEROS_FILE}...")
        try:
            with open(ZEROS_FILE, "r") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        gammas.append(mpmath.mpf(line))
            print(f"  > Loaded {len(gammas)} zeros.")
        except Exception as e:
            print(f"  > Error loading cache: {e}. Starting fresh.")
            gammas = []
            
    # 2. Check if we have enough
    current_count = len(gammas)
    if current_count >= n:
        print(f"  > Cache sufficient. Using first {n} zeros.")
        return gammas[:n]
        
    # 3. Compute missing zeros
    needed = n - current_count
    print(f"Computing {needed} additional zeros (starting from #{current_count+1})...")
    
    os.makedirs(os.path.dirname(ZEROS_FILE), exist_ok=True)
    
    batch = []
    for i in range(current_count + 1, n + 1):
        z = mpmath.zetazero(i)
        val = z.imag
        gammas.append(val)
        batch.append(val)
        
        # Save every 50 zeros
        if i % 50 == 0 or i == n:
            try:
                with open(ZEROS_FILE, "a") as f:
                    for g in batch:
                        f.write(f"{g}\n")
                batch = [] # Clear batch after save
            except Exception as e:
                print(f"  > Warning: Failed to save batch: {e}")
                
            print(f"  > {i}/{n} (Saved)", end='\r')
            
    print("")
    return gammas

# -----------------------------------------------------------------------------
# CORE MATHEMATICAL FUNCTIONS (High Precision)
# -----------------------------------------------------------------------------

def TruePi(X, primes):
    import bisect
    count = bisect.bisect_right(primes, float(X))
    return mpmath.mpf(count)

def LogIntegral(X):
    if X < 2: return mpmath.mpf(0)
    return mpmath.li(X)

def TrivialZeros(X):
    if X < 2: return mpmath.mpf(0)
    term1 = -mpmath.log(2)
    term2 = 1 / (2 * X * X * mpmath.log(X))
    return term1 + term2

def J_Wave(X, betas, gammas):
    """
    The PRISTINE Explicit Formula. 
    Zeros are strictly invariant. The coordinate X carries the gauge.
    """
    if X < 2: return mpmath.mpf(0)
    
    ln_X = mpmath.log(X)
    total_sum = mpmath.mpf(0)
    
    for b, g in zip(betas, gammas):
        term = (mpmath.power(X, b) / ln_X) * (mpmath.sin(g * ln_X) / g) * 2
        total_sum += term
        
    return LogIntegral(X) - total_sum + TrivialZeros(X)

def mobius(n):
    """
    Computes the Mobius function mu(n).
    Returns 1 if n is square-free with even prime factors.
    Returns -1 if n is square-free with odd prime factors.
    Returns 0 if n has a squared prime factor.
    """
    if n == 1: return 1
    
    p = 0
    # Check 2 separately
    if n % 2 == 0:
        n //= 2
        p += 1
        if n % 2 == 0: return 0
    
    # Check odd factors
    i = 3
    while i * i <= n:
        if n % i == 0:
            n //= i
            p += 1
            if n % i == 0: return 0
        i += 2
        
    if n > 1:
        p += 1
        
    return -1 if p % 2 != 0 else 1

def MobiusPi(X, betas, gammas, use_dynamic=True):
    """
    Applies Möbius Inversion.
    If use_dynamic is True, it generates terms until X^(1/k) < 2.
    If False, it uses the hardcoded fast set (valid for X < 50).
    """
    if X < 2: return mpmath.mpf(0)
    
    if not use_dynamic:
        # Fast path for small X (Exp 1A, Exp 3)
        mobius_terms = {1: 1, 2: -1, 3: -1, 5: -1, 6: 1, 7: -1}
        pi_reconstructed = mpmath.mpf(0)
        
        for m, mu in mobius_terms.items():
            root_X = mpmath.power(X, mpmath.mpf(1)/m)
            if root_X < 2: break 
                
            J_val = J_Wave(root_X, betas, gammas)
            pi_reconstructed += (mpmath.mpf(mu) / m) * J_val
            
        return pi_reconstructed
    else:
        # Dynamic path for arbitrary X (Exp 1B, Exp 2, etc)
        pi_reconstructed = mpmath.mpf(0)
        m = 1
        while True:
            root_X = mpmath.power(X, mpmath.mpf(1)/m)
            if root_X < 2: break
            
            mu = mobius(m)
            if mu != 0:
                J_val = J_Wave(root_X, betas, gammas)
                pi_reconstructed += (mpmath.mpf(mu) / m) * J_val
            
            m += 1
            # Safety break for sanity, though X^(1/m) < 2 should trigger first
            if m > 1000: break
            
        return pi_reconstructed

# -----------------------------------------------------------------------------
# SCALE-INVARIANT HELPER FUNCTIONS (Exp 4, 5, 6)
# -----------------------------------------------------------------------------

def unfolded_N(T):
    """
    Riemann-Von Mangoldt formula for N(T).
    Approximation for number of zeros with Im(rho) < T.
    N(T) ~ (T/2pi) * log(T/2pi) - (T/2pi) + 7/8
    """
    if T <= 0: return mpmath.mpf(0)
    
    T = mpmath.mpf(T)
    factor = T / TAU # T / 2pi
    
    term1 = factor * mpmath.log(factor)
    term2 = factor
    return term1 - term2 + 0.875 # 7/8

def mean_spacing(T):
    """
    Derivative N'(T) gives density. Spacing is 1/Density.
    N'(T) ~ (1/2pi) * log(T/2pi)
    Spacing ~ 2pi / log(T/2pi)
    """
    if T <= 1: return mpmath.mpf(0.1) # Small T fallback
    
    T = mpmath.mpf(T)
    # Density = 1/2pi * log(T/2pi)
    # Spacing = 1 / Density = 2pi / log(T/2pi)
    
    denom = mpmath.log(T / TAU)
    return TAU / denom

def find_nearest_zero(target, zeros):
    """
    Finds the zero in 'zeros' list closest to 'target'.
    Assumes 'zeros' is sorted.
    Returns (index, val, distance).
    """
    import bisect
    
    # Bisect gives insertion point i such that all e in a[:i] have e <= x
    idx = bisect.bisect_left(zeros, target)
    
    # Check neighbors: idx and idx-1
    candidates = []
    
    if idx < len(zeros):
        candidates.append((idx, zeros[idx]))
    if idx > 0:
        candidates.append((idx-1, zeros[idx-1]))
        
    if not candidates:
        return -1, mpmath.mpf(0), mpmath.inf
        
    # Find min distance
    best_i, best_val, best_dist = -1, 0, mpmath.inf
    
    for i, val in candidates:
        dist = abs(val - target)
        if dist < best_dist:
            best_dist = dist
            best_i = i
            best_val = val
            
    return best_i, best_val, best_dist

# -----------------------------------------------------------------------------
# IO UTILS
# -----------------------------------------------------------------------------

def load_or_init_results():
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, "r") as f:
                return json.load(f)
        except:
            pass
    return {
        "meta": {
            "dps": int(mpmath.mp.dps),
            "zeros": ZERO_COUNT,
            "tau": float(TAU)
        },
        "experiment_1": {},
        "experiment_2": {},
        "experiment_3": {}
    }

def save_results(data):
    # Update meta to current run params, preserving existing keys (like verdicts)
    new_meta = {
        "dps": int(mpmath.mp.dps),
        "zeros": ZERO_COUNT,
        "tau": float(TAU)
    }
    
    if "meta" in data:
        data["meta"].update(new_meta)
    else:
        data["meta"] = new_meta
    
    print(f"Saving to {OUTPUT_FILE}...")
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    
    # Sanitize data to remove Infinity/NaN which break JS JSON.parse
    def sanitize(obj):
        if isinstance(obj, float):
            if math.isinf(obj) or math.isnan(obj):
                return None
            return obj
        if hasattr(obj, 'ae'): # Check for mpmath numbers (mpf, mpc)
             # mpmath numbers behave like floats but might need casting
             try:
                 f = float(obj)
                 if math.isinf(f) or math.isnan(f):
                     return None
                 return f
             except:
                 return str(obj)
        if isinstance(obj, dict):
            return {k: sanitize(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [sanitize(v) for v in obj]
        if isinstance(obj, tuple):
            return tuple(sanitize(v) for v in obj)
        return obj

    # Pre-process data to ensure compatible floats
    # This also converts mpmath.mpf to native float for JSON
    
    def recursive_float_cast(obj):
        if isinstance(obj, (int, str, bool, type(None))):
            return obj
        if hasattr(obj, 'ae') or 'mpmath' in str(type(obj)): # mpmath types
            try:
                f = float(obj)
                if math.isinf(f) or math.isnan(f): return None
                return f
            except:
                return str(obj)
        if isinstance(obj, float):
            if math.isinf(obj) or math.isnan(obj): return None
            return obj
        if isinstance(obj, dict):
            return {k: recursive_float_cast(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [recursive_float_cast(v) for v in obj]
        return obj

    try:
        clean_data = recursive_float_cast(data)
        with open(OUTPUT_FILE, "w") as f:
            json.dump(clean_data, f)
    except Exception as e:
        print(f"CRITICAL ERROR SAVING JSON: {e}")

