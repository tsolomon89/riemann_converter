import mpmath
import os
import json
import math
import re
from decimal import Decimal, InvalidOperation

# -----------------------------------------------------------------------------
# MASTER CONFIGURATION
# -----------------------------------------------------------------------------
mpmath.mp.dps = 50   # Default
ZERO_COUNT = 20000  # Default number of zeros to compute
PRECISION = 50    # Default Decimal places of precision
PRIMES_FILE = os.getenv("RIEMANN_PRIMES_FILE", "data/primes/primes.count_7000000.jsonl")
PRIME_MIN_COUNT = 0
PRIME_TARGET_COUNT = 0
# Canonical artifact path (Next.js serves repo-root `public/`).
OUTPUT_FILE = "public/experiments.json"
ZEROS_FILE = os.getenv("RIEMANN_ZEROS_FILE", "data/zeros/nontrivial/zeros.generated.jsonl")
TAU = 2 * mpmath.pi
_PRIMES_CACHE = None
_PRIMES_CACHE_INFO = {"bad_rows": 0}
LAST_ZERO_SOURCE_INFO = {}
LAST_PRIME_SOURCE_INFO = {}
NUMERIC_TOKEN_RE = re.compile(r"^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$")
PRIME_TOKEN_RE = re.compile(r"^[+-]?\d[\d,]*(?:\.\d+)?$")
_STATIC_MOBIUS_TERMS = ((1, 1), (2, -1), (3, -1), (5, -1), (6, 1), (7, -1))
_MOBIUS_SCHEDULE_CACHE = {}
_MOBIUS_SCHEDULE_CACHE_LIMIT = 50000

def configure(dps=50, zero_count=20000, prime_min_count=None, prime_target_count=None):
    global PRECISION, ZERO_COUNT, TAU
    mpmath.mp.dps = dps
    PRECISION = dps
    ZERO_COUNT = zero_count
    TAU = 2 * mpmath.pi # Recompute TAU with new precision
    configure_prime_policy(prime_min_count=prime_min_count, prime_target_count=prime_target_count)
    print(f"  [Math Config] Precision: {dps} DPS, Zeros: {zero_count}")

def _sanitize_nonnegative_int(value, default=0):
    if value is None:
        return int(default)
    try:
        out = int(value)
    except Exception:
        return int(default)
    return max(0, out)

def configure_prime_policy(prime_min_count=None, prime_target_count=None):
    global PRIME_MIN_COUNT, PRIME_TARGET_COUNT
    if prime_min_count is not None:
        PRIME_MIN_COUNT = _sanitize_nonnegative_int(prime_min_count)
    if prime_target_count is not None:
        PRIME_TARGET_COUNT = _sanitize_nonnegative_int(prime_target_count)
    if PRIME_TARGET_COUNT < PRIME_MIN_COUNT:
        PRIME_TARGET_COUNT = PRIME_MIN_COUNT

def _extract_numeric_token(line):
    parts = line.strip().split()
    if not parts:
        return None
    token = parts[-1].strip().strip('"').strip("'")
    if not NUMERIC_TOKEN_RE.match(token):
        return None
    return token

def _decimal_places(token):
    tok = token.strip()
    if tok.startswith("+") or tok.startswith("-"):
        tok = tok[1:]
    if "e" in tok:
        tok = tok.split("e", 1)[0]
    if "E" in tok:
        tok = tok.split("E", 1)[0]
    if "." not in tok:
        return 0
    return len(tok.split(".", 1)[1])

def _dominant_decimal_places(decimal_hist):
    if not decimal_hist:
        return None
    # Prefer the most frequent precision; tie-break with larger decimal count.
    return sorted(decimal_hist.items(), key=lambda kv: (kv[1], kv[0]), reverse=True)[0][0]

def _zero_sequence_stats(gammas):
    descents = 0
    duplicates = 0
    for a, b in zip(gammas, gammas[1:]):
        if a > b:
            descents += 1
        elif a == b:
            duplicates += 1
    is_sorted = descents == 0
    strict_increasing = descents == 0 and duplicates == 0
    return {
        "is_sorted": bool(is_sorted),
        "descent_count": int(descents),
        "duplicate_count": int(duplicates),
        "strict_increasing": bool(strict_increasing),
    }

def _build_zero_source_info(source_path, source_kind, requested_count):
    return {
        "source_path": source_path,
        "source_kind": source_kind,
        "requested_count": int(requested_count),
        "loaded_count": 0,
        "line_count": 0,
        "declared_decimals": None,
        "is_sorted": None,
        "descent_count": None,
        "duplicate_count": None,
        "strict_increasing": None,
        "valid": True,
        "errors": [],
        "warnings": [],
    }

def _finalize_zero_source_info(info, gammas, line_count=0, decimal_hist=None):
    info["loaded_count"] = int(len(gammas))
    info["line_count"] = int(line_count)
    info["declared_decimals"] = _dominant_decimal_places(decimal_hist or {})
    stats = _zero_sequence_stats(gammas)
    info.update(stats)
    return info

def get_last_zero_source_info():
    return dict(LAST_ZERO_SOURCE_INFO) if isinstance(LAST_ZERO_SOURCE_INFO, dict) else {}

def _build_prime_source_info(max_val, target_count, min_required_count):
    return {
        "source_path": PRIMES_FILE,
        "source_kind": "uninitialized",
        "target_max_val": float(max_val),
        "target_count": int(target_count),
        "min_required_count": int(min_required_count),
        "loaded_count": 0,
        "max_prime": None,
        "line_count": 0,
        "bad_rows": 0,
        "valid": True,
        "errors": [],
        "warnings": [],
    }

def get_last_prime_source_info():
    return dict(LAST_PRIME_SOURCE_INFO) if isinstance(LAST_PRIME_SOURCE_INFO, dict) else {}

def _parse_prime_token(token):
    candidate = token.strip().strip('"').strip("'")
    if not candidate:
        return None
    if not PRIME_TOKEN_RE.match(candidate):
        return None
    candidate = candidate.replace(",", "")
    try:
        dec = Decimal(candidate)
    except (InvalidOperation, ValueError):
        return None
    if dec != dec.to_integral_value():
        return None
    val = int(dec)
    if val < 2:
        return None
    return val

def _parse_prime_line(line):
    s = line.strip()
    if not s or s.startswith("#"):
        return None, False

    # Most files are one value per line. As a fallback, try final whitespace token.
    tokens = [s]
    parts = s.split()
    if parts and parts[-1] != s:
        tokens.append(parts[-1])

    for token in tokens:
        parsed = _parse_prime_token(token)
        if parsed is not None:
            return parsed, True

    return None, True

def _sieve_primes(limit):
    cap = max(3, int(limit))
    sieve = bytearray(b"\x01") * cap
    sieve[0:2] = b"\x00\x00"
    root = int(cap ** 0.5) + 1
    for i in range(2, root):
        if sieve[i]:
            start = i * i
            step = i
            sieve[start:cap:step] = b"\x00" * (((cap - 1 - start) // step) + 1)
    return [i for i in range(2, cap) if sieve[i]]

def _sieve_primes_with_floor(min_count, max_val):
    target_count = max(0, int(min_count))
    floor_val = max(2, int(math.ceil(float(max_val))))
    limit = max(floor_val + 1024, 2048)

    while True:
        primes = _sieve_primes(limit)
        if len(primes) >= target_count and primes and primes[-1] >= floor_val:
            return primes
        if limit > 200_000_000:
            raise ValueError("Prime sieve limit exceeded while satisfying minimum count.")
        limit = int(limit * 1.6) + 1024

# -----------------------------------------------------------------------------
# DATA LOADERS
# -----------------------------------------------------------------------------

def get_primes(max_val):
    """
    Returns a list of pure primes up to max_val.
    Used for the TruePi step function.
    Reads from canonical data/primes storage when available.
    """
    global _PRIMES_CACHE, _PRIMES_CACHE_INFO, LAST_PRIME_SOURCE_INFO
    print(f"Loading primes (target max_val={max_val})...")

    target_max = max(2, int(math.ceil(float(max_val))))
    min_required_count = _sanitize_nonnegative_int(PRIME_MIN_COUNT)
    target_count = _sanitize_nonnegative_int(PRIME_TARGET_COUNT)
    if target_count < min_required_count:
        target_count = min_required_count

    required_count = max(target_count, min_required_count)
    info = _build_prime_source_info(target_max, target_count, min_required_count)

    if (
        _PRIMES_CACHE is not None
        and len(_PRIMES_CACHE) > 0
        and len(_PRIMES_CACHE) >= required_count
        and _PRIMES_CACHE[-1] >= target_max
    ):
        info["source_kind"] = "memory_cache"
        info["loaded_count"] = int(len(_PRIMES_CACHE))
        info["max_prime"] = int(_PRIMES_CACHE[-1])
        info["bad_rows"] = int((_PRIMES_CACHE_INFO or {}).get("bad_rows", 0))
        LAST_PRIME_SOURCE_INFO = info
        print(f"  > Using cached prime file ({len(_PRIMES_CACHE)} primes, Max: {_PRIMES_CACHE[-1]}).")
        return _PRIMES_CACHE

    primes = []
    if os.path.exists(PRIMES_FILE):
        try:
            info["source_kind"] = "prime_file"
            bad_rows = 0
            line_count = 0
            with open(PRIMES_FILE, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    line_count += 1
                    parsed, candidate = _parse_prime_line(line)
                    if parsed is None:
                        if candidate:
                            bad_rows += 1
                        continue

                    if primes and parsed <= primes[-1]:
                        # Keep a strictly increasing sequence.
                        if parsed != primes[-1]:
                            bad_rows += 1
                        continue
                    primes.append(parsed)

                    if len(primes) >= required_count and primes[-1] >= target_max:
                        break

            info["line_count"] = int(line_count)
            info["bad_rows"] = int(bad_rows)
            if primes:
                info["loaded_count"] = int(len(primes))
                info["max_prime"] = int(primes[-1])
                if bad_rows > 0:
                    info["warnings"].append(
                        f"Skipped {bad_rows} malformed/unsorted prime rows."
                    )

                if len(primes) < required_count:
                    info["valid"] = False
                    info["errors"].append(
                        f"Prime file ended at {len(primes)} values; required >= {required_count}."
                    )
                elif primes[-1] < target_max:
                    info["valid"] = False
                    info["errors"].append(
                        f"Prime file max {primes[-1]} below required max_val {target_max}."
                    )

                if info["valid"]:
                    _PRIMES_CACHE = primes
                    _PRIMES_CACHE_INFO = {"bad_rows": int(bad_rows)}
                    LAST_PRIME_SOURCE_INFO = info
                    print(
                        f"  > Loaded prime file ({len(primes)} primes, Max: {primes[-1]}, "
                        f"bad rows: {bad_rows})."
                    )
                    return _PRIMES_CACHE
        except Exception as e:
            info["valid"] = False
            info["errors"].append(f"Error reading prime file: {e}")
            print(f"  > Error reading primes file: {e}. Falling back to sieve.")
    else:
        info["warnings"].append("Prime file not found; using sieve fallback.")

    # Fallback to Sieve if file missing/broken/insufficient.
    print("  > Generating primes via sieve...")
    try:
        sieve_count = max(required_count, 0)
        primes = _sieve_primes_with_floor(sieve_count, target_max)
        _PRIMES_CACHE = primes
        _PRIMES_CACHE_INFO = {"bad_rows": int(info.get("bad_rows", 0))}
        info["source_kind"] = "sieve_fallback"
        info["loaded_count"] = int(len(primes))
        info["max_prime"] = int(primes[-1]) if primes else None
        LAST_PRIME_SOURCE_INFO = info
        print(f"  > Generated {len(primes)} primes.")
        if required_count > 0 and len(primes) < required_count:
            raise ValueError(
                f"Prime policy requires >= {required_count} primes; generated {len(primes)}."
            )
        return _PRIMES_CACHE
    except Exception as sieve_exc:
        info["valid"] = False
        info["errors"].append(f"Sieve fallback failed: {sieve_exc}")
        LAST_PRIME_SOURCE_INFO = info
        raise

def get_zeros(n, source="generated", allow_corrupt_cache=False, progress_callback=None):
    """
    Returns first n imaginary parts of Riemann zeros (gammas).
    source: "generated" (default), or "file:<path>"
    """
    global LAST_ZERO_SOURCE_INFO
    gammas = []
    
    # Handle File Source
    if source.startswith("file:"):
        path = source.split("file:")[1]
        print(f"Loading zeros from external file: {path}...")
        info = _build_zero_source_info(path, "external_file", n)
        if not os.path.exists(path):
            print(f"  > ERROR: File not found: {path}!")
            info["valid"] = False
            info["errors"].append(f"File not found: {path}")
            LAST_ZERO_SOURCE_INFO = info
            return []
            
        try:
            # Detect format based on extension or content
            # Odlyzko files often have one zero per line, sometimes with index
            # customized parsing might be needed.
            # For now assuming one float per line
            import gzip
            opener = gzip.open if path.endswith(".gz") else open
            
            decimal_hist = {}
            line_count = 0
            with opener(path, "rt", encoding="utf-8", errors="replace") as f:
                count = 0
                for line in f:
                    s = line.strip()
                    if not s or s.startswith("#"):
                        continue
                    token = _extract_numeric_token(s)
                    if token is None:
                        continue
                    val = mpmath.mpf(token)
                    gammas.append(val)
                    d = _decimal_places(token)
                    decimal_hist[d] = decimal_hist.get(d, 0) + 1
                    line_count += 1
                    count += 1
                    if callable(progress_callback) and count % 1000 == 0:
                        progress_callback(
                            count,
                            n,
                            message="loading external zero source",
                            payload={"source_kind": "external_file"},
                        )
                    if count >= n:
                        break
            info = _finalize_zero_source_info(info, gammas, line_count=line_count, decimal_hist=decimal_hist)
            if not info["strict_increasing"]:
                info["valid"] = False
                info["errors"].append("External zero source is not strictly increasing.")
                LAST_ZERO_SOURCE_INFO = info
                print("  > ERROR: External zero source failed strict monotonicity check.")
                return []
            LAST_ZERO_SOURCE_INFO = info
            print(f"  > Loaded {len(gammas)} zeros from {path}.")
            if callable(progress_callback):
                progress_callback(
                    len(gammas),
                    n,
                    message="external zero load complete",
                    payload={"source_kind": "external_file"},
                )
            return gammas
        except Exception as e:
            print(f"  > Error reading zero file: {e}")
            info["valid"] = False
            info["errors"].append(f"Error reading external zero file: {e}")
            LAST_ZERO_SOURCE_INFO = info
            return []

    # 1. Try to load from cache (Default Generated)
    info = _build_zero_source_info(ZEROS_FILE, "generated_cache", n)
    decimal_hist = {}
    line_count = 0
    if os.path.exists(ZEROS_FILE):
        print(f"Loading cached zeros from {ZEROS_FILE}...")
        try:
            with open(ZEROS_FILE, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    s = line.strip()
                    if not s:
                        continue
                    token = _extract_numeric_token(s)
                    if token is None:
                        continue
                    gammas.append(mpmath.mpf(token))
                    d = _decimal_places(token)
                    decimal_hist[d] = decimal_hist.get(d, 0) + 1
                    line_count += 1
            print(f"  > Loaded {len(gammas)} zeros.")
        except Exception as e:
            print(f"  > Error loading cache: {e}. Starting fresh.")
            gammas = []
            decimal_hist = {}
            line_count = 0
            info["warnings"].append(f"Error loading cache: {e}. Ignoring cache.")
    
    info = _finalize_zero_source_info(info, gammas, line_count=line_count, decimal_hist=decimal_hist)
    if len(gammas) > 0 and not info["strict_increasing"]:
        info["valid"] = False
        if not allow_corrupt_cache:
            info["errors"].append("zeros.dat is not strictly increasing; refusing generated source.")
            LAST_ZERO_SOURCE_INFO = info
            print("  > ERROR: zeros.dat failed strict monotonicity check.")
            print("  > Refusing generated source. Use --allow-corrupt-zero-cache to bypass (not recommended).")
            return []
        info["warnings"].append("zeros.dat is not strictly increasing; bypassing integrity guard by request.")
        print("  > [WARN] zeros.dat is not strictly increasing. Continuing due to allow_corrupt_cache=True.")
            
    # 2. Check if we have enough
    current_count = len(gammas)
    if current_count >= n:
        print(f"  > Cache sufficient. Using first {n} zeros.")
        info["loaded_count"] = int(n)
        LAST_ZERO_SOURCE_INFO = info
        if callable(progress_callback):
            progress_callback(
                n,
                n,
                message="zero cache already sufficient",
                payload={"source_kind": "generated_cache"},
            )
        return gammas[:n]
        
    # 3. Compute missing zeros
    needed = n - current_count
    print(f"Computing {needed} additional zeros (starting from #{current_count+1})...")
    info["source_kind"] = "generated_computed"
    
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
            if callable(progress_callback):
                progress_callback(
                    i,
                    n,
                    message="computing additional zeros",
                    payload={"source_kind": "generated_computed"},
                )
            
    print("")
    if not decimal_hist:
        est_dec = max(0, int(mpmath.mp.dps) - 2)
        decimal_hist = {est_dec: len(gammas)}
    info = _finalize_zero_source_info(info, gammas, line_count=len(gammas), decimal_hist=decimal_hist)
    # Computed zeros should be strict unless cache bypass was allowed.
    if not info["strict_increasing"] and not allow_corrupt_cache:
        info["valid"] = False
        info["errors"].append("Generated zero list is not strictly increasing after computation.")
        LAST_ZERO_SOURCE_INFO = info
        print("  > ERROR: Generated zero list integrity failed after computation.")
        return []
    LAST_ZERO_SOURCE_INFO = info
    if callable(progress_callback):
        progress_callback(
            len(gammas),
            n,
            message="zero generation complete",
            payload={"source_kind": info.get("source_kind")},
        )
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

def J_Wave_equal_beta(X, beta, gammas, ln_X=None):
    """
    Optimized J-wave path when every beta is identical.
    """
    if X < 2:
        return mpmath.mpf(0)

    beta_mp = mpmath.mpf(beta)
    ln_val = mpmath.log(X) if ln_X is None else ln_X
    pre_factor = (mpmath.power(X, beta_mp) / ln_val) * 2
    sum_osc = mpmath.mpf(0)
    for g in gammas:
        sum_osc += mpmath.sin(g * ln_val) / g
    return LogIntegral(X) - (pre_factor * sum_osc) + TrivialZeros(X)

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

def _schedule_cache_key(X, use_dynamic, max_dynamic_m):
    x_key = mpmath.nstr(X, n=min(40, max(20, int(mpmath.mp.dps // 2))))
    return (x_key, bool(use_dynamic), int(max_dynamic_m))

def get_mobius_schedule(X, use_dynamic=True, max_dynamic_m=1000):
    """
    Return a reusable M?bius schedule of (m, mu, root_X) tuples for X.
    """
    if X < 2:
        return tuple()

    key = _schedule_cache_key(X, use_dynamic, max_dynamic_m)
    cached = _MOBIUS_SCHEDULE_CACHE.get(key)
    if cached is not None:
        return cached

    schedule = []
    if not use_dynamic:
        for m, mu in _STATIC_MOBIUS_TERMS:
            root_X = mpmath.power(X, mpmath.mpf(1) / m)
            if root_X < 2:
                break
            schedule.append((int(m), int(mu), root_X))
    else:
        m = 1
        while True:
            root_X = mpmath.power(X, mpmath.mpf(1) / m)
            if root_X < 2:
                break
            mu = mobius(m)
            if mu != 0:
                schedule.append((int(m), int(mu), root_X))
            m += 1
            if m > int(max_dynamic_m):
                break

    out = tuple(schedule)
    _MOBIUS_SCHEDULE_CACHE[key] = out
    if len(_MOBIUS_SCHEDULE_CACHE) > _MOBIUS_SCHEDULE_CACHE_LIMIT:
        _MOBIUS_SCHEDULE_CACHE.pop(next(iter(_MOBIUS_SCHEDULE_CACHE)))
    return out

def MobiusPi_equal_beta(X, beta, gammas, use_dynamic=True, schedule=None, max_dynamic_m=1000):
    """
    M?bius inversion optimized for the common equal-beta case.
    """
    if X < 2:
        return mpmath.mpf(0)

    sched = schedule if schedule is not None else get_mobius_schedule(
        X, use_dynamic=use_dynamic, max_dynamic_m=max_dynamic_m
    )
    pi_reconstructed = mpmath.mpf(0)
    beta_mp = mpmath.mpf(beta)
    for m, mu, root_X in sched:
        J_val = J_Wave_equal_beta(root_X, beta_mp, gammas)
        pi_reconstructed += (mpmath.mpf(mu) / m) * J_val
    return pi_reconstructed

def MobiusPi(X, betas, gammas, use_dynamic=True, schedule=None, max_dynamic_m=1000):
    """
    Applies M?bius Inversion.
    """
    if X < 2:
        return mpmath.mpf(0)

    sched = schedule if schedule is not None else get_mobius_schedule(
        X, use_dynamic=use_dynamic, max_dynamic_m=max_dynamic_m
    )
    pi_reconstructed = mpmath.mpf(0)
    for m, mu, root_X in sched:
        J_val = J_Wave(root_X, betas, gammas)
        pi_reconstructed += (mpmath.mpf(mu) / m) * J_val
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
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            print(f"  [WARN] Failed reading {OUTPUT_FILE}: {exc}")
    return {
        "meta": {
            "dps": int(mpmath.mp.dps),
            "zeros": ZERO_COUNT,
            "tau": float(TAU)
        },
        "experiment_1": {},
        "experiment_1b": {},
        "experiment_1c": {},
        "experiment_2": {},
        "experiment_2b": [],
        "experiment_3": {},
        "experiment_4": {},
        "experiment_5": {},
        "experiment_6": {},
        "experiment_7": {},
        "experiment_8": {},
        "experiment_9": {},
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
        tmp_output = f"{OUTPUT_FILE}.tmp"
        with open(tmp_output, "w", encoding="utf-8") as f:
            json.dump(clean_data, f)
        os.replace(tmp_output, OUTPUT_FILE)
    except Exception as e:
        print(f"CRITICAL ERROR SAVING JSON: {e}")

