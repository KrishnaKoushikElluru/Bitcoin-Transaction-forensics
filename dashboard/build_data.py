"""Builds dashboard/assets/data.js from the saved project outputs.

Run from the repository root:  python dashboard/build_data.py
Only reads files in outputs/. Nothing is recomputed from raw data.
"""
import json
import math
import os

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "outputs")
DEST = os.path.join(ROOT, "dashboard", "assets", "data.js")

NAMES = {
    "FIN3": "Largest Input Share", "FIN4": "Largest Output Share", "FIN5": "Fee-to-Value Ratio", "FIN6": "Fee Rate",
    "STR1": "Input/Output Address Ratio", "STR2": "Same-Transaction Address Reuse", "TMP1": "Input Address Age",
    "TMP2": "Output Address Age", "TMP4": "Prior Sender Transactions", "TMP5": "Prior Receiver Transactions",
    "TMP6": "Time Since Last Activity", "TMP7": "Distinct Active Time Steps", "NET1": "Linked Transactions (input side)",
    "NET2": "Linked Transactions (output side)", "num_input_addresses": "Input Address Count",
    "num_output_addresses": "Output Address Count", "total_BTC": "Total BTC", "fees": "Fees (BTC)", "size": "Size (bytes)",
    "in_txs_degree": "Incoming Degree", "out_txs_degree": "Outgoing Degree", "Time step": "Time Step",
    "TMP6_is_first_appearance": "First-Ever Appearance",
}


def r(x, nd=4):
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    return round(float(x), nd)


scores = pd.read_csv(os.path.join(OUT, "unknown_transaction_risk_scores.csv"))["illicit_risk_score"].to_numpy()
hist, _ = np.histogram(scores, bins=50, range=(0, 1))
ths = [round(t, 3) for t in list(np.arange(0.50, 0.995, 0.01)) + [0.995, 0.999]]
thr_counts = {str(t): int((scores >= t).sum()) for t in ths}
probs = np.concatenate([np.linspace(0.0005, 0.95, 380), np.linspace(0.951, 0.9995, 120)])
quant = [r(np.quantile(scores, p), 5) for p in probs]

top = pd.read_csv(os.path.join(OUT, "top_unknown_forensic_cases.csv"))
prof = pd.read_csv(os.path.join(OUT, "top20_forensic_case_profiles.csv")).set_index("txId")
pct = pd.read_csv(os.path.join(OUT, "top20_batch_percentile_analysis.csv"))
attr = pd.read_csv(os.path.join(OUT, "top_forensic_model_attributions.csv"))
named = {"FINANCIAL", "STRUCTURAL", "TEMPORAL", "NETWORK"}

cases = []
for _, row in top.iterrows():
    tx = int(row["txId"])
    g = pct[(pct.txId == tx) & (pct.value_type == "continuous")].copy()
    g["ext"] = (g.percentile_overall_labelled - 50).abs()
    flagged = g[g.unusualness.isin(["HIGH", "LOW"])].sort_values("ext", ascending=False).head(6)
    feats = [{
        "f": x.feature, "name": NAMES.get(x.feature, x.feature), "value": r(x.value, 6), "pct": r(x.percentile_overall_labelled, 2),
        "med": r(x.overall_median, 6), "c1": r(x.class1_median, 6), "c2": r(x.class2_median, 6), "u": x.unusualness,
    } for x in flagged.itertuples()]
    p = prof.loc[tx]
    fp = bool(p["num_input_addresses"] == 1 and p["num_output_addresses"] == 1 and p["TMP6_is_first_appearance"] == 1)
    a = attr[attr.txId == tx]
    att = None
    if len(a):
        a = a[a.feature_category.isin(named)].copy()
        a["abs"] = a.attribution_delta.abs()
        a = a.sort_values("abs", ascending=False).head(5)
        att = [{"f": x.feature, "name": NAMES.get(x.feature, x.feature), "d": r(x.attribution_delta, 4)} for x in a.itertuples()]
        full = attr[attr.txId == tx].iloc[0]
        margin = r(full.logit_margin, 2)
    else:
        margin = None
    cases.append({"rank": int(row["rank"]), "tx": tx, "step": int(row["Time step"]), "score": r(row["illicit_risk_score"], 6),
                  "band": row["risk_level"], "fingerprint": fp, "margin": margin, "features": feats, "attr": att})

data = {
    "scores": {"total": int(len(scores)), "hist": [int(h) for h in hist], "thr": thr_counts, "q": quant},
    "cases": cases,
}
os.makedirs(os.path.dirname(DEST), exist_ok=True)
with open(DEST, "w", encoding="utf-8") as f:
    f.write("window.FORENSICS_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n")
print("wrote", DEST, os.path.getsize(DEST), "bytes;", len(cases), "cases;", sum(1 for c in cases if c["attr"]), "with attribution")
