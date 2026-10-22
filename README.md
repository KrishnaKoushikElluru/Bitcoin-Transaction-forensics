"Bitcoin Transaction Forensics for Suspicious Activity Detection Using Behavioural and Network Analysis"

Developed as part of the course on "Forensic Analytics" at Vellore Institute of Technology, Chennai.

by "Krishna Koushik", "Peta Siva Nandhan Reddy"

Subject Code: CSE4074

Semester: Fall 2026-27

Professor: Dr. S. Johanan Joysingh

---

## What this project does

Bitcoin transactions are public, but one transaction's amount or address count rarely shows whether it belongs to illicit activity. This project ranks the unlabelled transactions of the Elliptic++ graph by suspicion and then explains each ranking with evidence that can be checked.

The research question: can combining financial, structural, temporal and network-derived indicators improve the detection and forensic interpretation of suspicious Bitcoin transactions?

A high score means a transaction deserves a closer look. It does not establish that the transaction is illicit, and nothing in this repository labels a transaction as fraud.

## Start here

| What | Where |
|---|---|
| Interactive walkthrough with every experiment, failure and result | [`dashboard/index.html`](dashboard/index.html) |
| Slides that follow the dashboard | [`presentation/Bitcoin_Forensics_Project_Review.pptx`](presentation/Bitcoin_Forensics_Project_Review.pptx) |
| Step-by-step guide for a newcomer, with a glossary | [`docs/PROJECT_GUIDE.md`](docs/PROJECT_GUIDE.md) |
| The work itself | [`notebooks/`](notebooks) |

To open the dashboard, double-click `dashboard/index.html`, or run `python -m http.server` inside `dashboard/` and visit `http://localhost:8000`. It needs no install. It uses a vendored copy of three.js and self-hosted fonts, so it also works offline. Click the nodes, switch the scaler, drag the threshold and open any experiment.

## Results in brief

Test period (time steps 42 to 49), illicit class. Thresholds were chosen on the validation period only.

| Model | Precision | Recall | F1 | ROC-AUC | PR-AUC |
|---|---|---|---|---|---|
| Logistic Regression | 0.4049 | 0.4485 | 0.4256 | 0.8921 | 0.2889 |
| Random Forest | 0.8465 | 0.4730 | 0.6069 | 0.8530 | 0.5469 |
| GraphSAGE, feature set B, RobustScaler (4 seeds, mean) | not tabulated | not tabulated | 0.3113 | 0.8296 | 0.2212 |
| GraphSAGE, feature set B, QuantileTransformer (4 seeds, mean) | 0.634 | 0.458 | 0.5317 | 0.8368 | 0.5165 |

- Random Forest is stronger on precision, F1 and PR-AUC. It is a single run on the 184-feature set A1 and has not been trained on feature set B yet.
- Replacing RobustScaler with a QuantileTransformer fitted on training rows raised the four-seed mean test PR-AUC from 0.2212 to 0.5165. RobustScaler had produced values up to about 2.29e10 on a few features whose training spread was almost zero.
- The frozen model (seed 42, threshold 0.90) flags 12,344 of 157,205 unknown transactions (7.85%). That is a prioritisation list, not an illicit rate.

## Pipeline

1. Audit the data and the transaction graph. All 234,355 edges join transactions of the same time step, so no edge crosses the train, validation and test periods.
2. Split by time: training steps 1 to 34, validation 35 to 41, test 42 to 49.
3. Audit the 166 inherited features for temporal availability. 13 show strong evidence of depending on wallet statistics that never change across time steps.
4. Build 14 features that use only history up to each transaction's own time step.
5. Train a two-layer GraphSAGE with a class-weighted loss, early stopping on validation PR-AUC and a threshold chosen on validation.
6. Freeze the model and its preprocessing, score the unknown transactions, and explain each score with reference-based unusualness, class association and feature-occlusion sensitivity.

Feature sets: A1 (183 original features plus a missingness flag), A2 (A1 without the 13 audited features), B (A2 plus the 14 new features and one indicator).

## Repository layout

```
notebooks/        the analysis, run in numeric order (see below), plus result tables (*.csv)
outputs/          result files, scores, attributions and the frozen model
  gnn_B_quantile_seed42/    model checkpoint, QuantileTransformer, medians, column lists, metadata
  gnn_checkpoints/          weights of each experiment
data/processed/   the 14 transaction-time-safe features (parquet)
dashboard/        interactive page, its data builder and vendored assets
presentation/     the slide deck
docs/             the newcomer guide
```

### Notebooks

| Notebook | Purpose |
|---|---|
| `01_Data_Undersatnding.ipynb` | Data inspection (the filename keeps its original spelling) |
| `02_Data_Processing.ipynb` | Merge, chronological split, baselines and the wallet-level audit |
| `03_Feature_Temporal_Audit.ipynb` | Audit of the 166 inherited features |
| `03_Transaction_Time_Safe_Features.ipynb` | Construction of the 14 new features |
| `04_GNN_Baseline.ipynb` | Graph audit, GraphSAGE experiments, scaling investigation, ablations |
| `05_Inference_Forensic_Analysis.ipynb` | Frozen-model scoring of the unknown transactions |
| `06_Class3_Forensic_Analysis.ipynb` | Behavioural profile of the top 20 flagged cases |
| `07_GNN_Attribution_Score_Analysis.ipynb` | Score saturation and feature-occlusion attribution |
| `08_Reference_Behavioural_Analysis.ipynb` | Reference-population analysis and the interactive `analyze_transaction()` |

## Running the notebooks

The Elliptic++ files are not in this repository (about 2 GB). Download them from the dataset repository (`git-disl/EllipticPlusPlus`) and place them in `data/raw/eliptic++/`. The folder name keeps its original spelling.

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt   # torch and torch_geometric: see the comments in the file
python -m ipykernel install --user --name financial-forensics
```

The notebooks contain absolute Windows paths from the machine they were written on (search for `Financial_Forensics`). Change them to your own folder before running. Restart the kernel and run all cells from the top after any long break.

Rules the work follows: the unknown class is never treated as licit, nothing that learns from data is fitted on validation or test rows, thresholds are never chosen with test labels, and the unknown class never defines a reference statistic.

## Rebuilding the dashboard data

```bash
python dashboard/build_data.py
```

This reads the CSV files in `outputs/` and rewrites `dashboard/assets/data.js`. The 3D scene is an illustrative sample of 1,700 nodes drawn to match the real class mix, split and score distribution. It does not show real transactions.

## Limits

One GraphSAGE configuration and one chronological split. Illicit prevalence falls from 11.58% in training to 4.61% in test. Most inherited features have no verified meaning. The feature families overlap, so ablations show associations only. The unknown class has no ground truth. Attribution measures model sensitivity, not cause.

## Data and credits

Dataset: Elliptic++, Elmougy and Liu, "Demystifying Fraudulent Transactions and Illicit Nodes in the Bitcoin Network for Financial Forensics", KDD 2023. Graph learning uses PyTorch Geometric. The dashboard uses three.js (MIT licence) and the Geist font family (SIL Open Font License); their licence files are in `dashboard/vendor` and `dashboard/fonts`.
