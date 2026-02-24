import json
import os

F = "dashboard/public/experiments.json"

if not os.path.exists(F):
    print("NO FILE")
    exit(1)

with open(F, "r") as f:
    d = json.load(f)

print("KEYS:", list(d.keys()))
if "meta" in d:
    print("META KEYS:", list(d["meta"].keys()))
    if "code_fingerprint" in d["meta"]:
        print("FINGERPRINTS OK")
    else:
        print("NO FINGERPRINTS")

if "summary" in d:
    s = d["summary"]
    print("SUMMARY:", json.dumps(s, indent=2))
else:
    print("NO SUMMARY")

# Check specific experiment data
if "experiment_4" in d:
    print("EXP 4 Data Points:", len(d["experiment_4"].get("1", []))) # Should be dict with metadata?
    # Wait, Exp 4 structure is results[str(k)] = row dict.
    print("EXP 4 Keys:", list(d["experiment_4"].keys()))
    if "1" in d["experiment_4"]:
        print("EXP 4 K=1:", d["experiment_4"]["1"])
    if "2" in d["experiment_4"]:
        print("EXP 4 K=2:", d["experiment_4"]["2"])

if "experiment_5" in d:
    print("EXP 5 Keys:", list(d["experiment_5"].keys()))
    if "1" in d["experiment_5"]:
        print("EXP 5 K=1:", d["experiment_5"]["1"])

if "experiment_6" in d:
    print("EXP 6 Keys:", list(d["experiment_6"].keys()))
    if "1" in d["experiment_6"]:
        print("EXP 6 K=1:", d["experiment_6"]["1"])

if "experiment_7" in d:
    print("EXP 7 Keys:", list(d["experiment_7"].keys()))
    if "calibrated" in d["experiment_7"]:
        print("EXP 7 Calibrated:", d["experiment_7"]["calibrated"])
