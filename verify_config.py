
import subprocess
import sys
import os

def test_run(args, description):
    print(f"\n--- Testing: {description} ---")
    cmd = [sys.executable, "experiment_engine.py"] + args
    print(f"Executing: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode != 0:
            print("FAILED")
            print("STDERR:", result.stderr)
            return False
            
        print("SUCCESS")
        # Check if output mentions the configuration
        if "Precision:" in result.stdout or "DPS" in result.stdout:
             print(" > Config confirmed in output.")
        else:
             print(" > WARNING: Config not explicitly logged.")
             
        return True
    except subprocess.TimeoutExpired:
        print("TIMEOUT (Expected for long runs, but we should be running quick mode)")
        return False
    except Exception as e:
        print(f"ERROR: {e}")
        return False

def main():
    print("Verifying Advanced Configuration...")
    
    # Test 1: High Precision (80), Small Scale
    if not test_run(["--run", "1", "--dps", "80", "--resolution", "10", "--zero-count", "50"], "High DPS (80)"):
        sys.exit(1)

    # Test 2: Low Precision (15)
    if not test_run(["--run", "1", "--dps", "15", "--resolution", "10", "--zero-count", "50"], "Low DPS (15)"):
        sys.exit(1)
        
    # Test 3: Custom Range
    if not test_run(["--run", "2", "--x-start", "10", "--x-end", "15", "--resolution", "10", "--zero-count", "50"], "Custom Range [10-15]"):
        sys.exit(1)

    print("\nAll Backend Verification Tests Passed.")

if __name__ == "__main__":
    main()
