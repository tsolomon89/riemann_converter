import argparse

def test_arg_parsing(run_arg):
    print(f"Testing arg: {run_arg}")
    run_args = [x.strip() for x in run_arg.split(",")]
    print(f"Parsed list: {run_args}")
    
    run_all = "all" in run_args
    print(f"Run All: {run_all}")
    
    if run_all or "1" in run_args:
        print("  -> Would run Exp 1")
    if run_all or "2" in run_args:
        print("  -> Would run Exp 2")
    if run_all or "3" in run_args:
        print("  -> Would run Exp 3")

    # Order check
    execution_order = []
    if run_all or "1" in run_args: execution_order.append("1")
    if run_all or "2" in run_args: execution_order.append("2")
    if run_all or "3" in run_args: execution_order.append("3")
    
    return execution_order

print("--- TEST 1: Single Item ---")
test_arg_parsing("1")

print("\n--- TEST 2: Multiple Items ---")
test_arg_parsing("1,3")

print("\n--- TEST 3: All ---")
test_arg_parsing("all")

print("\n--- TEST 4: Mixed with Spaces ---")
test_arg_parsing("1 , 2")
