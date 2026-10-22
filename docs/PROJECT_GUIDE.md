# Bitcoin Transaction Forensics — The Complete Beginner's Guide (End to End)

> **Project title:** *Bitcoin Transaction Forensics for Suspicious Activity Detection Using Behavioural and Network Analysis*
> **Course:** CSE4074 – Forensic Analytics (VIT) · **Dataset:** Elliptic++
> **Who this guide is for:** a friend who has never seen this project and must be able to understand every step, repeat it, and keep developing it alone.

---

## How to read this guide

| If you are… | Read this order |
|---|---|
| Totally new to the project | Section 1 → 2 → 3 → 5 → 6 → 9 (then the rest when needed) |
| Going to run the code | Section 4 (setup + run order) → Section 12 (gotchas) |
| Going to extend the project | Section 10 (what is frozen) → Section 11 (analyzer) → Section 13 (next steps) |
| Preparing for a viva / review | Section 1 → 6 → 8 → 14 (Q&A) |

Everything in this guide comes from the real notebooks and result files in the project folder. Where a number is quoted, the file it came from is named. Where something is **uncertain or inconsistent in the project files**, it is flagged with ⚠️.

---

## Table of contents

1. [The project in 60 seconds](#1-the-project-in-60-seconds)
2. [Glossary – every term explained](#2-glossary--every-term-explained)
3. [The data: what Elliptic++ is](#3-the-data-what-elliptic-is)
4. [Project layout, setup and how to run it](#4-project-layout-setup-and-how-to-run-it)
5. [The rules we never break](#5-the-rules-we-never-break)
6. [The full story, phase by phase (what we did, why, what failed)](#6-the-full-story-phase-by-phase)
7. [The 14 transaction-time-safe features (cheat sheet)](#7-the-14-transaction-time-safe-features)
8. [All final results in one place](#8-all-final-results-in-one-place)
9. [The frozen model and how to reload it](#9-the-frozen-model-and-how-to-reload-it)
10. [The forensic evidence layers](#10-the-forensic-evidence-layers)
11. [The interactive analyzer `analyze_transaction()`](#11-the-interactive-analyzer)
12. [Failures, dead ends and gotchas (the honest log)](#12-failures-dead-ends-and-gotchas)
13. [Alternatives we considered and next steps you can take](#13-alternatives-we-considered-and-next-steps)
14. [Viva / review questions with answers](#14-viva--review-questions-with-answers)
15. [File-by-file reference](#15-file-by-file-reference)

---

## 1. The project in 60 seconds

**The problem.** Bitcoin is public: every transaction is visible. But "public" does not mean "easy to understand". Looking at one transaction (how much BTC, how many inputs) almost never tells you if it belongs to crime (ransomware, scams, laundering) or normal use.

**The idea.** A transaction should be judged by *how it behaves*: how money moves (financial), what shape it has (structural), what history its addresses have (temporal), and how it is connected to other transactions (network). We build a **graph** of transactions, train a **graph neural network (GNN)** on the few labelled transactions, and then — most importantly — we **explain** each flagged transaction in plain language.

**What we actually built (all of it is done and runnable):**

1. Audited the dataset and the transaction graph (is it clean? any leakage between train/test?).
2. Trained two classical baselines (Logistic Regression, Random Forest).
3. Investigated whether the dataset's built-in features secretly use *future* information (we found 13 features with strong evidence of a "temporal-availability" problem).
4. Built 14 new features that only use information available at the transaction's own time.
5. Trained GraphSAGE (a GNN) on several feature sets (A1, A2, B) and ran ablations.
6. Found that our first scaler (RobustScaler) produced absurd numbers (up to 2.29 × 10¹⁰), fixed it with a QuantileTransformer, and the model's test PR-AUC jumped from ≈0.22 to ≈0.52.
7. Froze the final model (B + QuantileTransformer, seed 42, threshold 0.90).
8. Scored all 157,205 *unknown* transactions: 12,344 (7.85 %) scored ≥ 0.90.
9. Built a forensic explanation layer: *what is unusual* (compared with labelled transactions), *what the model reacts to* (feature perturbation), and an interactive function `analyze_transaction(tx_id)` that prints it all for any transaction.

**The one sentence you must never get wrong:**
> A high score means **"worth investigating"**. It does **not** mean "proven fraud". We never say "fraud" or "not fraud" for any transaction.

**Honest headline numbers:**
* Final GraphSAGE (B + QuantileTransformer, 4 seeds): test PR-AUC **0.5165 ± 0.0072**, ROC-AUC **0.8368 ± 0.0099**, F1 **0.5317 ± 0.0180**.
* Random Forest baseline is **better** on precision (0.8465), F1 (0.6069) and PR-AUC (0.5469). We report this honestly. The GNN is kept because the project is about graph-aware forensic modelling and explanation, not about winning a leaderboard.

---

## 2. Glossary – every term explained

Read this once now, and come back whenever a word confuses you.

### 2.1 Bitcoin terms

| Term | Plain-English meaning |
|---|---|
| **Blockchain** | A public, append-only list of all Bitcoin transactions, grouped in "blocks". Nobody can edit old entries. |
| **Transaction (tx)** | One transfer of Bitcoin. It spends some earlier outputs (inputs) and creates new outputs. |
| **Address** | Like an account number that receives Bitcoin. One person can use many addresses. |
| **Wallet** | Software/entity holding keys to many addresses. In this dataset "wallet" rows describe addresses. |
| **Input** | The money a transaction *spends* (it points back to an earlier output). Says "where the money came from". |
| **Output** | A new chunk of money created by the transaction, locked to an address. Says "where the money goes". |
| **UTXO** (Unspent Transaction Output) | An output that has not been spent yet. Bitcoin has no balances — only UTXOs. Spending a UTXO means using it as an input of a new transaction. |
| **Change** | If you spend a 2 BTC UTXO to pay 0.5 BTC, 1.5 BTC (minus fee) comes back to you as a "change" output. |
| **Fee** | Small amount (inputs − outputs) paid to miners for including the transaction. |
| **Transaction size** | Size of the transaction in bytes. Fee ÷ size = fee rate. |
| **Money-flow edge** | If transaction A creates an output and transaction B spends it, we draw an arrow A → B. |

### 2.2 Dataset terms

| Term | Meaning |
|---|---|
| **Elliptic** | An earlier public dataset of Bitcoin transactions with illicit/licit labels. |
| **Elliptic++** | The extended dataset we use (Elmougy & Liu, KDD 2023): transaction graph + address graph + 17 extra transaction characteristics. |
| **Node** | One item in a graph. Here: **one transaction** (203,769 of them). |
| **Edge** | A link between two nodes. Here: money flows from one transaction to another (234,355 of them). |
| **Time step** | The dataset groups transactions into 49 two-week-like slices numbered 1–49 (a time index, not a calendar date we use). |
| **Class 1 / illicit** | Transaction labelled as belonging to illicit activity (4,545). |
| **Class 2 / licit** | Labelled as normal activity (42,019). |
| **Class 3 / unknown** | No label (157,205). **Unknown does not mean licit.** |
| **Labelled population** | Class 1 + Class 2 = **46,564** transactions. Only these can be used for training and evaluation. |
| **txId** | The unique ID of a transaction (e.g. 196098540). |

### 2.3 Machine-learning terms

| Term | Meaning |
|---|---|
| **Feature** | One input column describing a transaction (e.g. number of input addresses). |
| **Label / target** | The answer we want to predict (illicit = 1, licit = 0). |
| **Supervised learning** | Learning from examples that have labels. |
| **Training set** | Data the model learns from (time steps 1–34). |
| **Validation set** | Data used to make *decisions* (when to stop training, which threshold to use) (steps 35–41). |
| **Test set** | Data used **once** at the end to report honest performance (steps 42–49). Never used for decisions. |
| **Chronological split** | Splitting by time (past → train, future → test) instead of randomly. Mirrors real use: a forensic model is always applied to *later* data. |
| **Data leakage** | When information that would not be available in real use sneaks into training/evaluation, making results look better than reality. |
| **Temporal availability** | Whether a feature could really be computed using only information that existed at the transaction's own time. |
| **Distribution shift** | The data changes over time. Here, illicit share drops from 11.58 % (train) to 4.61 % (test). |
| **Class imbalance** | Far fewer illicit than licit examples. Accuracy becomes useless (always saying "licit" already scores >90 %). |
| **Class weights** | Making mistakes on the rare class cost more during training (we use ≈0.5655 for licit, ≈4.3174 for illicit). |
| **Precision** | Of the transactions we flagged, how many were truly illicit? TP / (TP + FP). |
| **Recall** | Of all truly illicit transactions, how many did we catch? TP / (TP + FN). |
| **F1** | One number balancing precision and recall: 2PR / (P + R). |
| **TP / FP / FN / TN** | True/false positive/negative counts (positive = illicit). |
| **ROC-AUC** | How well the model *ranks* illicit above licit, ignoring any threshold (0.5 = coin-flip, 1 = perfect). Can look flattering under heavy imbalance. |
| **PR-AUC** (average precision) | Area under the precision-recall curve. **Our primary metric** because it is sensitive to the rare class. Depends on how common illicit is (prevalence). |
| **Probability / score** | The model's output between 0 and 1: "illicit-risk score". |
| **Logit** | The raw number before it becomes a probability. Probability = softmax(logits). Bigger illicit logit → higher risk. |
| **Softmax** | Function that turns the two logits (licit, illicit) into two probabilities that add to 1. |
| **Logit margin** | illicit logit − licit logit. Large margin = very confident. |
| **Softmax saturation** | When the margin is so big the probability prints as 1.000000 for many different transactions even though their logits differ. |
| **Threshold** | The cut-off above which we say "flag it" (we use 0.90, chosen on validation). |
| **Epoch** | One full pass of training. |
| **Early stopping** | Stop training when validation PR-AUC stops improving (patience = 30 epochs, max 200). |
| **Seed** | A number fixing the random starting point. Different seeds → slightly different models. We use 7, 21, 42, 84. |
| **Overfitting** | Model memorises training data and does poorly on new data. |
| **Hyper-parameter** | A setting you choose before training (hidden size 64, dropout 0.3, learning rate 0.01…). |
| **Baseline** | A simple reference model to compare against (Logistic Regression, Random Forest). |
| **Ablation** | Remove one part (e.g. one feature family) and re-train to see what changes. |
| **Logistic Regression** | Simple linear classifier. |
| **Random Forest** | Many decision trees voting. Strong on tabular data, needs no scaling. |
| **Loss function / cross-entropy** | The number training tries to minimise; measures how wrong the probabilities are. |
| **Adam** | The optimiser (update rule) that adjusts weights; learning rate 0.01. |
| **Weight decay** | A small penalty on big weights (5×10⁻⁴) that reduces overfitting. |
| **Dropout** | Randomly switching off 30 % of neurons during training to reduce overfitting. |
| **ReLU** | Activation function: max(0, x). |
| **Imputation** | Filling in missing values (we use the **training-set median**). |
| **Median** | The middle value. Robust to extreme values. |
| **IQR** | Inter-quartile range = 75th percentile − 25th percentile. |
| **Scaling / normalisation** | Rescaling features so they are comparable in size. |
| **RobustScaler** | (x − median) / IQR. Breaks when the IQR is almost zero (our big failure). |
| **QuantileTransformer** | Maps each feature to a bell-curve shape based on ranks; bounded output (max ≈ 5.1993). Our fix. |
| **Skewness / heavy tail** | A few huge values stretch the distribution. |
| **Outlier** | An extreme value. In forensics, outliers can be the interesting cases, so we do not delete them. |
| **Correlation (Spearman)** | How strongly two features move together by rank (−1…+1). |
| **Feature importance** | How much a model used a feature. It is *evidence to investigate*, never proof of leakage. |
| **Joblib / pickle** | Python formats for saving objects such as the fitted transformer. |
| **Checkpoint** | A saved snapshot of the model weights (`.pt` file). |
| **Frozen model** | Final model + preprocessing saved and never retrained, so results are reproducible. |
| **Reproducibility / determinism** | Re-running gives the same results. |

### 2.4 Graph terms

| Term | Meaning |
|---|---|
| **Graph G = (V, E)** | A set of nodes V and edges E. |
| **Directed** | Edges have a direction (A → B). |
| **Degree** | Number of edges at a node (in-degree = arriving, out-degree = leaving). |
| **Self-loop** | An edge from a node to itself (we have zero). |
| **Isolated node** | A node with no edges (we have zero). |
| **edge_index** | The 2 × (number of edges) array that stores the graph for PyTorch Geometric. |
| **GNN** (graph neural network) | A neural network that learns from both a node's own features and its neighbours' features. |
| **Message passing / neighbourhood aggregation** | Each node collects (averages) information from its neighbours. |
| **GraphSAGE / SAGEConv** | A GNN layer: new representation = function(own features, mean of neighbours' features). |
| **Full-batch** | One forward pass over the whole graph per training step. |
| **Mask** | A True/False array that says which nodes are train/validation/test. |
| **Cross-split edge** | An edge joining a train node to a test node. We have **zero**, which is why we trust the evaluation. |

### 2.5 Forensic-analysis terms (our own layer)

| Term | Meaning |
|---|---|
| **Suspicious vs. fraudulent** | Suspicious = worth a human look. Fraudulent = proven. We only ever claim the first. |
| **Decision-support system** | A tool that helps humans prioritise, not one that decides. |
| **Reference population** | The labelled transactions (Class 1 + 2) we compare an unknown transaction against. **Class 3 is never part of it.** |
| **Percentile** | "This value is higher than X % of the reference values." |
| **Unusualness: HIGH / LOW / NOT_EXTREME** | HIGH if percentile ≥ 95, LOW if ≤ 5, otherwise NOT_EXTREME. |
| **Class association** | Is a behaviour more common among labelled illicit than labelled licit transactions? |
| **Behavioural fingerprint** | The combination "1 input address + 1 output address + first-ever appearance". |
| **Perturbation / occlusion attribution** | Replace one feature with a neutral baseline value, rerun the model, see how much the illicit logit changes. |
| **Model sensitivity** | A non-zero change from that test. It is **not causality** and **not proof**. |
| **Risk band** | LOW < 0.50, MODERATE 0.50 to < 0.90, HIGH ≥ 0.90. Only 0.90 was validated; 0.50 is a presentation midpoint. |

### 2.6 Engineering terms

| Term | Meaning |
|---|---|
| **Jupyter notebook (.ipynb)** | A file mixing code cells, outputs and notes. |
| **Kernel** | The running Python process behind a notebook. "Restart kernel" wipes its memory. |
| **venv (`.venv`)** | An isolated Python environment holding the exact library versions. |
| **nbconvert** | Command-line tool that executes a notebook top to bottom. |
| **Parquet** | A compact table file format (we store the 14 safe features in one). |
| **CPU build of PyTorch** | We never used a GPU (`torch.cuda.is_available()` was False throughout). |


---

## 3. The data: what Elliptic++ is

Source: the Elliptic++ dataset by Elmougy & Liu (KDD 2023), public GitHub repository `git-disl/EllipticPlusPlus`. The raw files live in `data/raw/eliptic++/` (note the spelling "eliptic" — it is how the folder is named; do not "fix" it or every notebook path breaks). The data is **large (≈ 2 GB)** and is **not** something you rebuild; download it from the source and place it in that folder.

### 3.1 The files and what each one is

| File | Size | What it contains |
|---|---|---|
| `txs_features.csv` | ≈ 695 MB | One row per transaction: `txId`, `Time step`, 93 `Local_feature_*`, 72 `Aggregate_feature_*`, and 17 "augmented" characteristics = **184 columns**. |
| `txs_classes.csv` | 2.4 MB | `txId`, `class` (1 illicit, 2 licit, 3 unknown). |
| `txs_edgelist.csv` | 4.5 MB | Transaction → transaction edges (234,355). **This is the graph the GNN uses.** |
| `AddrTx_edgelist.csv` | 21 MB | Address → transaction links (which addresses were *inputs* of which transaction). |
| `TxAddr_edgelist.csv` | 37 MB | Transaction → address links (which addresses are *outputs*). |
| `wallets_features.csv` | ≈ 606 MB | One row per (address, time step) with wallet statistics (lifetime, number of transactions, BTC sent/received…). **Contains full-history snapshots — see Phase 3.** |
| `wallets_classes.csv`, `wallets_features_classes_combined.csv` | 30 / 609 MB | Address labels and a combined table. Not needed for the final pipeline. |
| `data/raw/EllipticPlusPlus_Feature_Dictionary.xlsx` | small | Official (incomplete) description of features. |

### 3.2 The numbers to memorise

| Quantity | Value |
|---|---|
| Transactions (nodes) | **203,769** |
| Transaction → transaction edges | **234,355** |
| Time steps | **49** |
| Illicit (Class 1) | 4,545 (≈ 2.23 % of all nodes) |
| Licit (Class 2) | 42,019 (≈ 20.62 %) |
| Unknown (Class 3) | 157,205 (≈ 77.15 %) |
| Labelled population | 46,564 (illicit ≈ 9.76 % of these) |
| Features in `txs_features.csv` | 183 (+ `txId`) = `Time step` + 93 local + 72 aggregate + 17 augmented |

### 3.3 The 17 "augmented" columns (already in the dataset!)

`in_txs_degree`, `out_txs_degree`, `total_BTC`, `fees`, `size`, `num_input_addresses`, `num_output_addresses`, and five input-side + five output-side BTC statistics (`in_BTC_min/max/mean/median/total`, `out_BTC_min/max/mean/median/total`).

> **Important early lesson.** During data understanding we computed our own `input_count`, `output_count`, `tx_in_degree`, `tx_out_degree` — and then discovered the dataset **already contains** them as `num_input_addresses`, `num_output_addresses`, `in_txs_degree`, `out_txs_degree`. We therefore **never claim these as new features**. Always check what the dataset already has before "engineering" something.

### 3.4 The 166 "inherited" features

`Time step` + `Local_feature_1…93` + `Aggregate_feature_1…72` = 166. They come from the original Elliptic dataset and are mostly **anonymous**: we know numbers, not meanings. Only about 13 have documented meaning and 6 have pattern-inferred meaning; **147 have no verified meaning**. We never invent a meaning for them.

### 3.5 Three kinds of relationships (what a "graph" means here)

* **Address → Transaction:** which addresses *funded* a transaction (inputs).
* **Transaction → Address:** which addresses *received* from it (outputs).
* **Transaction → Transaction:** money flowing from one transaction to the next. **This is the graph used by the GNN.** The address relations are used to *build* and *audit* features.

### 3.6 Data quirks you must know

1. **965 transactions have all 17 augmented features missing together** (16,405 missing values = 965 × 17). They are absent from the address edge files entirely. Class makeup of those 965: **0 illicit, 519 licit, 446 unknown.** The missingness is structural, not random.
2. **`Local_feature_15`** is almost constant (51 unique values, one value ≈ 99.85 % of rows). We audited it and kept it — "almost constant" is not automatically "useless".
3. **Heavy tails:** many features are extremely skewed (some skewness > 200). Extremes are **kept**, because unusual amounts/counts are exactly what forensics looks for. Zero degrees are real structure, not missing data.
4. **Illicit share changes over time:** 11.58 % (train) → 8.62 % (validation) → 4.61 % (test). Inside the periods it swings wildly: under 1 % at steps 1, 5, 45, 46; over 35 % at step 13; test step 42 ≈ 11 %, steps 44–46 ≈ 0.3–1.8 %, step 49 ≈ 11.8 %.
5. **Every graph edge joins two transactions of the same time step** (234,355 / 234,355). Good for leakage safety, but it means we can't know the order of transactions *within* a time step.
6. **`wallets_features.csv` has duplicate (address, time step) rows** — up to 568 copies for one address in one step. They are identical, so `drop_duplicates(subset=["address","Time step"])` before joining is safe. Joining without this caused a `MemoryError` (see Section 12).

---

## 4. Project layout, setup and how to run it

### 4.1 Folder structure

```
Financial_Forensics/
├── data/
│   ├── raw/eliptic++/                  # original CSV files (download yourself)
│   ├── raw/EllipticPlusPlus_Feature_Dictionary.xlsx
│   └── processed/transaction_time_safe_features_v1.parquet   # our 14 safe features (+ TMP6 indicator)
├── notebooks/                          # ALL the work lives here (see 4.2)
│   ├── 01 … 08 *.ipynb
│   └── *.csv                           # experiment-result tables written by notebooks 02 and 04
├── outputs/                            # results of inference, forensics and the frozen model (see Section 15)
│   ├── gnn_B_quantile_seed42/          # the FROZEN pipeline (model + preprocessing)
│   ├── gnn_checkpoints/                # per-experiment model weights
│   └── forensic_analysis_plots/
├── reports/                            # written reports (draft report .docx, this guide)
├── src/                                # empty – no reusable Python package was written; logic lives in notebooks
├── requirements.txt
└── .venv/                              # Python virtual environment (not shared)
```

### 4.2 The notebooks – what each is and why it exists

Run them **in this order**. Each one reads what the previous ones produced.

| # | Notebook | Purpose | Why we created it |
|---|---|---|---|
| 01 | `01_Data_Undersatnding.ipynb` (typo in name — keep it) | Look at every file; class counts, time steps, missingness, degrees, skew. | Understand the data before touching it. No modelling. |
| 02 | `02_Data_Processing.ipynb` | Merge labels, build the chronological split, train-only imputation and scaling, **Logistic Regression + Random Forest baselines**, and the **wallet-level leakage investigation** (static snapshots, reconstruction tests). | Get honest baselines and discover the temporal-availability problem. |
| 03a | `03_Feature_Temporal_Audit.ipynb` | Feature-by-feature audit of the 166 inherited features. | Decide which inherited features to distrust. |
| 03b | `03_Transaction_Time_Safe_Features.ipynb` | Builds the **14 transaction-time-safe features**, with assertions and hand-traced checks; writes the parquet file. | Replace the distrusted features with ones that only use information available at the transaction's time. |
| 04 | `04_GNN_Baseline.ipynb` | Graph audit; GraphSAGE experiments A1, A2, B and four ablations; scaling investigation; QuantileTransformer experiment (3b); multi-seed runs. | The main modelling notebook. |
| 05 | `05_Inference_Forensic_Analysis.ipynb` | Reload the **frozen** model, score all 157,205 unknown transactions, flag ≥ 0.90, pick the top 20. | Use the model on the real target: unlabelled transactions. |
| 06 | `06_Class3_Forensic_Analysis.ipynb` | Behavioural profile (financial/structural/temporal/network) of the top-20 flagged cases + the shared fingerprint. | Add descriptive evidence to a bare score. |
| 07 | `07_GNN_Attribution_Score_Analysis.ipynb` | Why do the top cases all show score 1.0? (saturation) and **feature-occlusion attribution** on 8 representative cases. | Add the "what does the model react to?" layer. |
| 08 | `08_Reference_Behavioural_Analysis.ipynb` | Compare each case with the labelled reference population (percentiles, medians), fingerprint statistics, and the interactive `analyze_transaction()`. | Add the "what is statistically unusual?" layer and the final user-facing tool. |

Two files `02_Data_Processing.backup_*.ipynb` are safety copies from before risky edits; ignore them.

### 4.3 Setup on a new machine (Windows, CPU only)

1. Install **Python 3.10**. Create the environment inside the project folder:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```
2. `requirements.txt` already pins numpy 1.26.4, pandas 2.3.0, scipy 1.15.3, scikit-learn 1.6.1, matplotlib, joblib, pyarrow, nbconvert, ipykernel, **torch 2.6.0** and **torch_geometric 2.8.0.post1**. If installing torch from PyPI is slow/unavailable, use the CPU wheel index:
   ```bash
   pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
   pip install torch_geometric==2.8.0.post1
   ```
3. Register the environment as a Jupyter kernel (the project used the name `financial-forensics`):
   ```bash
   python -m ipykernel install --user --name financial-forensics
   ```
4. **Fix the hard-coded paths.** The notebooks contain absolute paths of the original author, e.g. `C:\Users\koush\OneDrive\Documents\Financial_Forensics\data\raw\eliptic++`. Search every notebook for `koush` and replace with your own folder (variables are usually called `DATA_DIR`, `OUTPUTS_DIR`, `ARTIFACT_DIR`). This is the #1 reason "it doesn't run on my laptop".
5. Put the Elliptic++ CSVs into `data/raw/eliptic++/`.

### 4.4 Running

* Interactively: open a notebook, choose the `financial-forensics` kernel, **Restart Kernel → Run All**.
* Headless (what we used to produce verified outputs):
  ```bash
  python -m jupyter nbconvert --to notebook --execute --inplace --ExecutePreprocessor.timeout=1200 --ExecutePreprocessor.kernel_name=financial-forensics notebooks/08_Reference_Behavioural_Analysis.ipynb
  ```
* Rough cost (CPU): each GraphSAGE training run ≈ 2–4.5 minutes and several GB of RAM; NET1/NET2 feature construction in notebook 03b is the slowest step (progress is logged every 20,000 transactions); the Random Forest in notebook 02 takes a few minutes; `analyze_transaction()` takes ≈ 7–8 seconds per transaction because it runs 32 model forward passes.
* **Always restart the kernel and run top to bottom** after any long gap — see the "stale kernel" failure in Section 12.

---

## 5. The rules we never break

These were set at the start and re-checked at every step. If you extend the project, keep them — they are what make the results defensible.

1. **Unknown (Class 3) is never treated as licit.** Only Class 1 and Class 2 are used for training and evaluation. Class 3 stays in the graph (as neighbours) but never enters the loss or any metric.
2. **No random split for the main experiment.** Always chronological by `Time step`.
3. **Fit scalers/imputers/medians on the training set only.** Then only `transform` validation, test and unknown data (never `fit`).
4. **Never choose a threshold with test labels.** Choose on validation; the test result is whatever that fixed threshold gives.
5. **High feature importance is not proof of leakage.** Leakage claims need empirical evidence about *when* the information is available.
6. **Suspicious ≠ fraudulent.** Output language: "model-based illicit-risk score", "supports forensic prioritisation", "does not establish illicit activity". Never "fraud / not fraud / legitimate / confirmed illicit".
7. **Distribution shift is not leakage.** They are separate arguments.
8. **Never overwrite baseline result CSVs** (Logistic Regression and Random Forest).
9. **Separate claims in writing:** what the literature says vs. what our own experiments show vs. what is still an open hypothesis.
10. **Dedupe `(address, Time step)` before joining wallet data** (many-to-many blow-up).
11. **Class 3 must never define reference statistics.**
12. **Attribution is model sensitivity, not causality;** a zero attribution does not prove a feature is irrelevant. Only report attribution when it was actually computed for that transaction.
13. **Compare like with like.** Say plainly when a baseline (Random Forest) is better.


---

## 6. The full story, phase by phase

Each phase says: **what we did → why → how → what we found → what went wrong → what we learned.**

```
Phase 0  Frame the problem and plan                      (Review 1 slides)
Phase 1  Understand the data                              (notebook 01)
Phase 2  Prepare data + classical baselines               (notebook 02)
Phase 3  The leakage detective story                      (notebook 02, later cells)
Phase 4  Audit all 166 inherited features                 (notebook 03a)
Phase 5  Build 14 transaction-time-safe features          (notebook 03b)
Phase 6  First GraphSAGE experiments A1 / A2 / B + ablations (notebook 04)
Phase 7  The loss-is-huge mystery → RobustScaler pathology (notebook 04)
Phase 8  The QuantileTransformer fix + multi-seed runs    (notebook 04, scripts)
Phase 9  Final ablations under QuantileTransformer
Phase 10 Freeze the model                                  (outputs/gnn_B_quantile_seed42)
Phase 11 Score the 157,205 unknown transactions           (notebook 05)
Phase 12 Forensic evidence layers                          (notebooks 06, 07, 08)
Phase 13 The interactive analyzer, version by version      (notebook 08)
```

---

### Phase 0 – Frame the problem and plan

**Research question.** *Can combining transaction-level financial characteristics with structural, temporal and network-derived behavioural indicators improve the detection and forensic interpretation of suspicious Bitcoin transactions?*

**Literature check (so we don't claim fake novelty).** GNNs, temporal GNNs, heterogeneous GNNs, subgraph methods have all been applied to Elliptic/Elliptic++ (Elmougy & Liu 2023; Lo et al. 2023 *Inspection-L*; Ferretti et al. 2024; Bellei et al. 2024; Song et al. 2024 *RevTrack*; Chen et al. 2025 *MDST-GNN*; Xiao & Yin 2026; Han et al. 2026 *FG-EGCN*). So **proposing another architecture would add little**. Our contribution is positioned elsewhere:

1. an audit of whether the inherited features are really available at transaction time,
2. a set of clean, documented, transaction-time-safe behavioural features,
3. a diagnosis-driven preprocessing fix, and
4. a forensic layer that explains *why* a transaction is flagged.

**Planned architecture (the diagram in the Review 1 deck):** Stage 1 data & feature layer → Stage 2 behavioural representation → Stage 3 graph-based learning → Stage 4 forensic output. The final project follows this exactly.

**Planned evaluation:** accuracy is meaningless (all-licit already scores > 90 %), so use **PR-AUC (primary), illicit-class F1, precision, recall**, and ROC-AUC only for comparability with other papers.

**What we learned:** decide the claims you can honestly make *before* running experiments.

---

### Phase 1 – Understand the data (notebook 01)

**What we did.** Loaded every CSV, printed shapes and heads, counted classes, looked at the distribution of transactions per time step, checked missing values, skewness, cardinality and degrees.

**Key observations** (all later confirmed):

| # | Observation | Consequence |
|---|---|---|
| 1 | 183 transaction features: inherited Elliptic features + 17 augmented ones | Know exactly which columns exist |
| 2 | 965 transactions have all 17 augmented features missing, and no address records | Missingness indicator + imputation (Phase 2) |
| 3 | Missing transactions have a higher average time step and a different class mix | Missingness is not random-looking |
| 4 | Labelled data: illicit ≈ 9.76 %, licit ≈ 90.24 %; 77 % of all transactions unknown | Severe imbalance; unknown ≠ licit |
| 5 | Many features are heavy-tailed (skewness > 200 for some) | Scaling will matter (it did, a lot) |
| 6 | Extreme values must not be auto-removed | They may be exactly the suspicious behaviour |
| 7 | Degree zeros are meaningful | Do not treat as missing |
| 8 | Some features have very low cardinality | Keep as numbers for now |
| 9 | `Local_feature_15` is almost constant | Audit, don't delete |

**Pitfall discovered here:** our own "new" degree/count features already existed in the dataset (see Section 3.3). Verify before engineering.

---

### Phase 2 – Prepare data and train classical baselines (notebook 02)

**Why baselines first?** A neural network result means nothing without simple reference models on the *same* split.

**Step-by-step pipeline in notebook 02:**

1. **Merge** `txs_features.csv` with `txs_classes.csv` on `txId` → 203,769 rows.
2. **Check duplicates** (transactions and rows): none.
3. **Separate** `txId`, features, and target.
4. **Missing-value audit:** 16,405 missing values, all in the 17 augmented columns, all in the same 965 transactions.
5. **Labelled dataset:** keep Class 1 and Class 2 only → **46,564** rows. Target: illicit = 1, licit = 0.
6. **Missingness indicator** `augmented_features_missing` (1 for the 965) so the model can *see* that data was missing.
7. **Sort by Time step** and make the **chronological split**:
   ```python
   train = labelled[labelled["Time step"] <= 34]      # 29,894 rows, 11.58% illicit
   val   = labelled[labelled["Time step"].between(35, 41)]  # 7,829 rows, 8.62% illicit
   test  = labelled[labelled["Time step"] >= 42]      # 8,841 rows, 4.61% illicit
   ```
8. **Train-only imputation:** medians computed on the training rows only, then applied to train/val/test.
9. **Inspect scales** across features (inherited ones were approximately standardised; augmented ones were not).
10. **Scaling for Logistic Regression:** `RobustScaler` fitted on training only (scalers matter for linear models). Random Forest needs no scaling.
11. **Train Logistic Regression** (`class_weight="balanced"`, `max_iter=2000`) and **Random Forest** (`n_estimators=300`, `class_weight="balanced"`, `random_state=42`), training period only.
12. **Threshold:** for Logistic Regression thresholds 0.5 and 0.7 were compared on **validation**; 0.7 was reported on test. Random Forest used the default 0.5.

**Results (test period, illicit class):**

| Model | Threshold | Precision | Recall | F1 | ROC-AUC | PR-AUC |
|---|---|---|---|---|---|---|
| Logistic Regression | 0.70 | 0.4049 | 0.4485 | 0.4256 | 0.8921 | 0.2889 |
| Random Forest | 0.50 | **0.8465** | 0.4730 | **0.6069** | 0.8530 | **0.5469** |

(Saved in `notebooks/logistic_regression_baseline_results.csv` and `random_forest_results.csv`. **Never overwrite these.**)

**What went wrong / what we noticed:**

* The Random Forest reached an almost perfect PR-AUC on the *training* data, and the **feature-importance** ranking was dominated by address-history features. Together that raised the question: *are some inherited features secretly using information from the future?* → Phase 3.
* Logistic Regression has the best ROC-AUC (0.8921) but a poor PR-AUC (0.2889): a perfect example of why ROC-AUC alone misleads under imbalance.

---

### Phase 3 – The leakage detective story (notebook 02, later cells)

**The hypothesis.** Some inherited transaction features were computed from `wallets_features.csv`, and that file holds *full-history snapshots*. If so, a transaction in time step 5 would "know" about the address's behaviour in time step 40. In a real investigation that information would not exist yet → **temporal-availability problem** (a type of leakage).

**Important rule:** high feature importance is *not* proof. We needed independent evidence. Chain of evidence we built:

| Step | Test | Result |
|---|---|---|
| 1 | For addresses that appear in several time steps, do their wallet statistics change over time? | **No.** For all **273,268** repeated addresses, `lifetime_in_blocks` (and 9 other columns: `last_block_appeared_in`, `total_txs`, `btc_sent_total`, `btc_received_total`, `btc_transacted_total`, `transacted_w_address_total`, `btc_transacted_mean`, `btc_received_mean`, …) were 100 % identical across observations. A concrete address showed 27 time steps with zero variation. → they are **static full-history snapshots**, not point-in-time values. |
| 2 | Reconstruct one documented feature, `Local_feature_53` ("min lifetime of input addresses"), from the wallet table | Related, but not identical: Pearson 0.637, Spearman 0.451. |
| 3 | Reconstruct other presumed pairs (13 pairs, then a wider set) | Spearman only 0.01–0.82 (no clean one-to-one match) → the *documented* mapping mostly does **not** hold. |
| 4 | Broaden the search: 18 wallet columns × 4 aggregations = 72 candidates per transaction; find the best match per feature | `Local_feature_41` (documented "incoming") and `Local_feature_47` ("outgoing") **both** best-match `num_txs_as_sender` → the feature dictionary's labels look inconsistent. |
| 5 | Rule out the innocent explanation (sender/receiver counts being collinear) | Spearman −0.11 → not collinear; the label confusion is real. |
| 6 | **Ceiling test:** can wallet columns *jointly* predict a feature? (Random-Forest regression on a 25,000-row subsample with a held-out set) | **Test R² = 0.80–0.98** for features 53, 41, 47 and 23. |
| 7 | Combine 1 + 6 | The inherited features are largely explainable from static full-history wallet data. **Conclusion:** they very likely encode full-history address information. |

**How careful the wording is (and must stay):** this is *strong, reproducible empirical evidence*, not literal proof of the original authors' code (which we don't have). We write *"strong empirical evidence of dependence on wallet-level information that remained static across repeated temporal observations, creating a temporal-availability concern"* — **never** "these features are definitely leaked". And we **never** claimed all 166 features are affected.

**Failures in this phase (read Section 12 for details):**

* **MemoryError** merging wallet data (duplicate `(address, Time step)` rows — up to 568 copies).
* **Stale kernel** gave 4,686,055 rows instead of the correct 477,117 — fixed by restarting the kernel and running top to bottom.
* **A 77-minute run** (full 200k rows, all cores, 144 features) never finished; the 25,000-row, capped-depth version reproduced the same conclusion in < 3 minutes.

---

### Phase 4 – Audit all 166 inherited features (notebook 03a)

**Why a separate notebook?** So the long, careful audit doesn't keep growing notebook 02.

**Two questions per feature, never mixed up:**

* **Question A:** can the feature be substantially reconstructed from wallet-level variables?
* **Question B:** are those wallet-level variables themselves static full-history values?

A feature earns a *strong temporal-availability concern* label only when there is evidence for **both**.

**Steps**

1. **Setup & reproducibility fix.** We discovered that sorting with `sort_values(by="Time step")` uses an **unstable** quicksort: rows with the same time step could come in a different order on another machine, which changes a Random Forest's bootstrap sampling. Proof: an independent re-run of the same RF cell gave a different confusion matrix and feature ranking. Fix: sort by `[Time step, txId]` with `kind="mergesort"` (stable). The audit RF therefore does not exactly match notebook 02's official Model 2 — expected and fine (it is only a triage tool; official numbers stay in notebook 02).
2. **Stage 0 – inventory** of all 166 features by how well their meaning is known: **13 documented, 6 pattern-inferred, 147 not verified** (we never invent meanings for the 147).
3. **Stage 1 – triage:** merge in RF importance; *high priority* = documented/pattern-inferred meaning **and** top-30 importance. These are candidates for deeper tests (staticness, reconstruction).

**Outcome (used everywhere afterwards):**

| Group | Features |
|---|---|
| **13 strong temporal-availability concern** | `Local_feature_49, 65, 30, 29, 23, 47, 25, 43, 41, 54, 53, 55, 18` |
| 1 potential concern | `Local_feature_90` |
| 2 insufficient evidence | `Local_feature_5`, `Local_feature_14` |
| remaining inherited features | not audited in depth; **not claimed clean** |

Only 16 of 166 were audited deeply; 150 remain unverified. That is a stated limitation.

---

### Phase 5 – Build 14 transaction-time-safe features (notebook 03b)

**Goal.** Give the model behavioural information (financial, structural, temporal, network) without using any full-history table. See Section 7 for the full feature list.

**Hard constraints we set**

* Use **only** `txs_features.csv`, `AddrTx_edgelist.csv`, `TxAddr_edgelist.csv`. **Never** `wallets_features.csv`, never labels, never train a model here.
* Each feature has a stated information boundary, enforced by assertions (`<= t` or `< t`).

**Decisions and why**

| Decision | Reason |
|---|---|
| **FIN2** (output-value concentration, HHI) **dropped, not approximated** | A true HHI needs every individual output value; the files only give min/max/mean/median/total. We refuse to ship a "proxy that isn't what it claims to be". Final set = 14. |
| **FIN1** deferred/rejected | Not part of the final implemented feature set. |
| `TMP6` uses **strictly `< t`**, others use `<= t` | Within a time step the order of transactions is unknowable (edges are same-step only), so TMP6 ("time since last activity") is built from strictly earlier steps to avoid ambiguity. |
| Count features computed with cumulative sums, not self-joins | A self-join of the edge table on `address` explodes for "hub" addresses (earlier 6 GB memory incident). NET1/NET2 use per-address Python dictionaries and set unions instead. |

**The TMP1/TMP2 bug (a good lesson).**
First version computed address age from the *input-role* history only (for TMP1) and *output-role* only (for TMP2). Counter-example that caught it: address A is an **output** at step 2 and later an **input** at step 7. For a step-7 transaction using A as input, age should be 7 − 2 = **5**, but the buggy code gave 7 − 7 = **0**. Fix: build one combined (address, time step) activity table from **both** edge files and use it for both TMP1 and TMP2 ("any-role" age). Impact: 3,174 TMP1 values (1.56 %) and 688 TMP2 values (0.34 %) changed — every change an *increase*, as expected when more history is pooled in.

**Verification we did:** five transactions hand-traced independently (three deliberately drawn from the changed cases); assertions for every boundary; deterministic output.

**Output:** `data/processed/transaction_time_safe_features_v1.parquet` (203,769 × 17: `txId`, `Time step`, FIN3–6, STR1–2, TMP1/2/4/5/6/7, NET1–2, `TMP6_is_first_appearance`).

**Facts to remember**

* `TMP6` is undefined (missing) for **84.53 %** of transactions (first appearances). We keep `TMP6_is_first_appearance` as an indicator so that information isn't lost.
* The 965 transactions without address records get missing safe features too.
* **Correlations (Spearman):** TMP1–TMP7 = 0.999, TMP4–NET1 = 0.900, STR2–TMP4 = 0.795, FIN3–STR1 = −0.718. The families are **not independent**, so ablations are associations, not causal proof.
* **Honest limitation:** this fixes the count/age-driven half of the flagged features. The *value-driven* ones (23, 25, 29, 30, 65) have **no safe replacement** because per-address BTC value data does not exist in the edge files.

---

### Phase 6 – First GraphSAGE experiments (notebook 04)

#### 6.1 Graph audit (done again here, "never assume from earlier notebooks")

* Nodes 203,769; directed edges 234,355; self-loops 0; duplicate edges 0; isolated nodes 0 (every node has ≥ 1 edge).
* Mean out-degree ≈ 1.41 (max 472), mean in-degree ≈ 1.58 (max 284).
* **All 234,355 edges join transactions of the same time step:** train↔train 156,843; validation↔validation 35,360; test↔test 42,152; **cross-split edges = 0**.

**Why this matters.** In a GNN each node reads its neighbours. If a training node had a test node as a neighbour, test information could leak into training. With zero cross-split edges, neighbourhood information never crosses the chronological partitions, so the evaluation is leakage-conscious. (Side effect: we cannot know the order of transactions inside one time step.)

#### 6.2 How the graph is built (the code idea)

1. `txid_to_node = {txId: index}` (rows sorted by txId).
2. Map both columns of `txs_edgelist.csv` to node indices → `edge_index` tensor of shape `[2, 234355]`.
3. **No reverse edges, no self-loops added.** Direction = money flow.
4. Labels: licit 0, illicit 1, **unknown = −1** (never used by loss/metrics, still present for message passing).
5. Masks: `train_mask`, `val_mask`, `test_mask` from `Time step` and labelled status.

#### 6.3 The model (locked before experiments, never tuned between them)

```python
class GraphSAGENet(nn.Module):
    def __init__(self, in_dim, hidden_dim, out_dim, dropout):
        super().__init__()
        self.conv1 = SAGEConv(in_dim, hidden_dim)   # e.g. 186 -> 64
        self.conv2 = SAGEConv(hidden_dim, out_dim)  # 64 -> 2 logits (licit, illicit)
        self.dropout = dropout
    def forward(self, x, edge_index):
        h = F.relu(self.conv1(x, edge_index))
        h = F.dropout(h, p=self.dropout, training=self.training)
        return self.conv2(h, edge_index)
```

| Setting | Value |
|---|---|
| Layers / hidden size | 2 × SAGEConv, hidden = 64 |
| Activation / dropout | ReLU, 0.3; **no BatchNorm / LayerNorm** |
| Loss | `CrossEntropyLoss` with class weights from **training labels only**: `w_c = N_train / (2·N_c)` → licit 0.5655, illicit 4.3174 |
| Optimiser | Adam, lr 0.01, weight decay 5×10⁻⁴ |
| Training | full-batch (whole graph each step) |
| Early stopping | validation PR-AUC, patience 30, max 200 epochs, restore best epoch |
| No SMOTE | we use class weights instead; no test-derived preprocessing; no hyper-parameter tuning between experiments |

**Threshold selection (validation only):** try 0.10, 0.20 … 0.90; pick the best validation F1. If the best is at the boundary (0.90), run a finer sweep 0.80–0.99. If the optimum is **still at the edge**, we label it **"unresolved"** instead of pretending 0.99 is the optimum. The test set is never used for this.

#### 6.4 The three feature representations

| Name | # features | Contents | Why it exists |
|---|---|---|---|
| **A1** | 184 | all 183 original features + `augmented_features_missing` | Anchor: same features as the classical baselines |
| **A2** | 171 | A1 minus the **13** audited temporal-availability-concern features | Isolate the effect of removing them |
| **B** | 186 | A2 + 14 safe features + `TMP6_is_first_appearance` (171 + 14 + 1) | Test whether time-safe behaviour features help |

#### 6.5 Results with RobustScaler (single seed 42)

| Experiment | Feat. | Best epoch | Val PR-AUC | Thr. | Resolved? | Test Prec | Test Rec | Test F1 | Test ROC-AUC | Test PR-AUC |
|---|---|---|---|---|---|---|---|---|---|---|
| 1: A1 | 184 | 15 | 0.4807 | 0.96 | yes | 0.2564⚠️ | 0.4142⚠️ | 0.3168⚠️ | 0.8294 | 0.1870 |
| 2: A2 | 171 | 4 | 0.4262 | 0.70 | yes | 0.3764 | 0.3284 | 0.3508 | 0.8190 | 0.2911 |
| 3: B | 186 | 15 | 0.4585 | 0.99 | **no** | 0.2252 | 0.4118 | 0.2912 | 0.8231 | 0.1877 |
| 4: B − Financial | 182 | 56 | 0.5287 | 0.99 | **no** | 0.3167 | 0.4191 | 0.3608 | 0.8451 | 0.2297 |
| 5: B − Structural | 184 | 16 | 0.4967 | 0.99 | **no** | 0.2347 | 0.4608 | 0.3110 | 0.8445 | 0.2194 |
| 6: B − Temporal | 179 | 4 | 0.4175 | 0.70 | yes | 0.2951 | 0.2966 | 0.2958 | 0.8167 | 0.2614 |
| 7: B − Network | 184 | 16 | 0.4779 | 0.99 | **no** | 0.2268 | 0.4730 | 0.3066 | 0.8453 | 0.2143 |

⚠️ *The A1 precision/recall/F1 in `gnn_experiment_results.csv` (0.2564 / 0.4142 / 0.3168) differ from the numbers typed into notebook 04's analysis table (0.2384 / 0.4657 / 0.3154). PR-AUC and ROC-AUC are identical in both. The CSV was regenerated when notebook 04 was re-executed on 29 Sep to add Experiment 3b. Use the CSV and be aware of the discrepancy.*

**What these results said (and what they did not):**

* Every GNN was **worse than Random Forest** (test PR-AUC 0.18–0.29 vs 0.5469).
* Validation and test PR-AUC often moved in **opposite directions** (e.g. A1→A2, B-Temporal) — a warning sign that single runs are noisy.
* Four of the seven runs (B, B−Financial, B−Structural, B−Network) ended at the **unresolved** boundary threshold 0.99. ⚠️ Notebook 04's own limitations list says "5 of 7"; its results table shows 4 — use the table.
* Why might GNNs lose to RF here? *Hypotheses only:* edges are same-step only, mean degree is ~1.4–1.6, heavy-tailed inputs, temporal shift, threshold instability, and RF's scale-invariance. None was proven at this point.
* The notebook's own "recommended next experiment": **repeat with several seeds** to see how much of the difference is just noise. We did (Phase 8).

**A useful multi-seed discovery under RobustScaler (4 seeds):** B averaged test PR-AUC **0.2212 ± 0.0285** (range 0.1877–0.2558), F1 0.3113 ± 0.0184, and the threshold resolved in only 1 of 4 seeds; B-Temporal averaged 0.1981 ± 0.0454. So B-Temporal's apparently "best" single-run 0.2614 was **inside the noise**. Lesson: never rank experiments from a single seed.

> **Experiment 3b** (B + QuantileTransformer) was later added to notebook 04 as real, executable cells (not just a results table) so it can be shown live. It reproduced the seed-42 result exactly (best epoch 81, val PR-AUC 0.8923, threshold 0.90, test P 0.6080, R 0.4485, F1 0.5162, ROC-AUC 0.8371, PR-AUC 0.5063). The checkpoint is saved as `exp3b_B_quantile_model.pt` without overwriting the older `exp3_B_model.pt`.

---

### Phase 7 – The "loss is huge" mystery → the RobustScaler pathology

**Symptom.** In *every* RobustScaler run the training/validation loss was in the **thousands to hundreds of thousands** (e.g. validation loss 140,610 in Experiment 1). A healthy 2-class cross-entropy is around 0.1–1.

**Step 1 — rule out a bug.** We verified: manual weighted cross-entropy equals PyTorch's; no NaN or Inf; correct shapes, labels and class weights. Per-node loss: the **top 1 % of nodes caused ~100 % of the total loss** while the median node's loss was 0.0000.

**Step 2 — find the guilty features.** Auditing all 183 scaled columns:

| Feature | Raw max (train) | Train IQR | Max abs RobustScaler output |
|---|---|---|---|
| `Local_feature_37` | ≈ 13.85 | ≈ 1.22×10⁻⁸ | **≈ 2.29×10¹⁰** |
| `Local_feature_35` | ≈ 34.02 | ≈ 1.92×10⁻⁸ | ≈ 1.41×10¹⁰ |
| `Local_feature_72/73/71/58/64` and others | — | tiny | 10⁶ – 10⁸ |

None of the 13 new behavioural features came close (worst: `FIN5` ≈ 12,000).

**Step 3 — why.** For each of those features the training minimum and median were identical: at least 75 % of training rows share one constant value, so IQR ≈ 0. RobustScaler divides by IQR, so the rare real outliers explode. **The raw values are not large — the scaler manufactured the huge numbers.** This is a known failure of IQR-based scaling on near-constant data.

**Careful claims.** This does *not* show those features are bad data or leaky; a near-constant bulk with rare outliers can also be a genuine rare forensic signal. And we did **not** claim the scaling problem is the only reason the GNN lost to Random Forest (RF is scale-invariant, so it was unaffected — a plausible, unproven contributor).

---

### Phase 8 – The QuantileTransformer fix + multi-seed runs

**The change (and only this change):** replace `RobustScaler()` with
```python
from sklearn.preprocessing import QuantileTransformer
qt = QuantileTransformer(output_distribution="normal", n_quantiles=1000, random_state=42)
qt.fit(X_train[scaling_cols])                      # TRAIN ROWS ONLY
X[scaling_cols] = qt.transform(X[scaling_cols])    # then transform everything
```
applied to the **183 continuous columns** (170 retained original + 13 continuous new features). The 3 binary columns (`augmented_features_missing`, `STR2`, `TMP6_is_first_appearance`) stay unscaled. Everything else (graph, masks, architecture, optimiser, class weights, early stopping, threshold protocol) was left identical.

**Why a quantile transform works here:** it replaces each value by its rank-based position on a bell curve, so outputs are **bounded** (max |value| = **5.1993** in every run) no matter how degenerate the IQR is. It is a *diagnosis-driven correction*, not hyper-parameter tuning.

**Seed-42 comparison:**

| | B + RobustScaler | B + QuantileTransformer |
|---|---|---|
| Validation PR-AUC | 0.4585 | **0.8923** |
| Threshold / resolved | 0.99 / no | 0.90 / **yes** |
| Test precision / recall | 0.2252 / 0.4118 | **0.6080** / 0.4485 |
| Test F1 | 0.2912 | **0.5162** |
| Test ROC-AUC | 0.8231 | 0.8371 |
| Test PR-AUC | 0.1877 | **0.5063** |
| Max abs transformed value | 2.29×10¹⁰ | 5.1993 |
| Loss share of top 1 % of nodes | 100 % | 37.6 % |

**Four seeds (7, 21, 42, 84) – B + QuantileTransformer (`gnn_quantile_multiseed_results.csv`):**

| Seed | Best epoch | Val PR-AUC | Threshold | Test Prec | Test Rec | Test F1 | Test ROC-AUC | Test PR-AUC |
|---|---|---|---|---|---|---|---|---|
| 7 | 72 | 0.8863 | 0.90 | 0.6974 | 0.4632 | 0.5567 | 0.8240 | 0.5166 |
| 21 | 98 | 0.8939 | 0.92 | 0.6258 | 0.4632 | 0.5324 | 0.8381 | 0.5210 |
| 42 | 81 | 0.8923 | 0.90 | 0.6080 | 0.4485 | 0.5162 | 0.8371 | 0.5063 |
| 84 | 85 | 0.8749 | 0.70 | 0.6052 | 0.4583 | 0.5216 | 0.8482 | 0.5220 |
| **mean ± sd** | | 0.8868 ± 0.0086 | | 0.634 ± 0.043 | 0.458 ± 0.007 | **0.5317 ± 0.0180** | **0.8368 ± 0.0099** | **0.5165 ± 0.0072** |

All four thresholds were **resolved**. Compared with RobustScaler's 4-seed average (test PR-AUC 0.2212, F1 0.3113), test PR-AUC more than doubled with nothing else changed.

⚠️ *Mean precision/recall are computed from the CSV (0.634 / 0.458). The seed-42 row in that CSV was filled from the earlier single-seed run (rounded values, empty loss columns).*

**Frozen seed = 42** — chosen for deterministic deployment, **not** because it is best. In fact seed 42 has the lowest test PR-AUC and F1 of the four.

---

### Phase 9 – Final ablations under QuantileTransformer (4 seeds each)

| Configuration | Features | Test PR-AUC | Test ROC-AUC | Test F1 |
|---|---|---|---|---|
| **B-QT (full)** | 186 | 0.5165 ± 0.0072 | **0.8368 ± 0.0099** | 0.5317 ± 0.0180 |
| A2-QT (no safe features) | 171 | 0.5148 ± 0.0133 | 0.8136 ± 0.0292 | 0.5352 ± 0.0120 |
| B-QT − Financial (FIN3–6) | 182 | 0.5112 ± 0.0445 | 0.8172 ± 0.0620 | 0.5508 ± 0.0341 |
| B-QT − Structural (STR1–2) | 184 | 0.5204 ± 0.0207 | 0.8174 ± 0.0478 | 0.5442 ± 0.0252 |
| B-QT − Temporal (TMP1,2,4,5,6,7 + indicator) | 179 | 0.5083 ± 0.0103 | 0.7950 ± 0.0153 | 0.5518 ± 0.0130 |
| B-QT − Network (NET1–2) | 184 | 0.5011 ± 0.0359 | 0.8141 ± 0.0602 | 0.5157 ± 0.0488 |

**How to read this honestly**

* Removing the **temporal** family lowered ROC-AUC in every run: every temporal-removed run (0.7724–0.8062) is below every full-B run (0.8240–0.8482). A reproducible ranking effect in this setup.
* But **PR-AUC and F1 do not move robustly** when any family is removed; all means sit within about one standard deviation of each other.
* **A2-QT ≈ B-QT** on PR-AUC and F1: adding the 14 safe features did not give a clear PR-AUC/F1 gain; B-QT has the best and most stable ROC-AUC.
* Because features within and across families correlate (TMP1–TMP7 = 0.999 etc.), **do not claim "temporal features are most important"** and do not claim causality.

**Threshold note:** in these ablations the threshold was resolved in 4 of 4 seeds for Structural, Temporal and Network and for A2-QT, but only **3 of 4** for Financial (seed 7 hit the 0.99 boundary). That is one more reason to treat Financial-removal numbers (the widest spread, ± 0.0445 PR-AUC) cautiously.

**Where the files are:** `gnn_a2_quantile_multiseed_*.csv`, `gnn_quantile_ablation_multiseed_*.csv`, `gnn_quantile_ablation_remaining_multiseed_*.csv` in `notebooks/` (Financial & Network in one pair, Structural & Temporal in the "remaining" pair).

---

### Phase 10 – Freeze the model

**Why freeze?** A forensic result must be reproducible: same input → same score, always. So the *whole pipeline* is saved, and nothing is ever re-fitted at inference time.

Saved in `outputs/gnn_B_quantile_seed42/` (plus the weights `outputs/gnn_checkpoints/gnn_B_quantile_seed42.pt`):

| File | What it holds |
|---|---|
| `model_checkpoint.pt` | model weights + architecture (`in_dim`, `hidden_dim`, `out_dim`, `dropout`) + `selected_threshold` 0.90 |
| `quantile_transformer.joblib` | the fitted QuantileTransformer |
| `median_imputation.joblib` | train medians for the 17 augmented columns and the 14 new features, and which new features are continuous |
| `feature_columns.json` | the exact 186 column names in the exact order |
| `scaling_columns.json` | the 183 columns that are scaled |
| `binary_columns.json` | the 3 binary columns |
| `metadata.json` | representation B, QT settings, seed 42, class weights, best epoch 81, threshold 0.90, validation/test metrics, node/edge counts |

**Reproducibility checks done:** reloading reproduced the validated test metrics **exactly**; fresh predictions on a 200-node sample differed from stored ones by max absolute difference **0**. Later, the live scoring in notebook 08 reproduced stored Class-3 scores to within 10⁻⁵.

---

### Phase 11 – Score the 157,205 unknown transactions (notebook 05)

**Procedure** (no training, no fitting):

1. Load the frozen model and preprocessing artifacts.
2. Rebuild the graph and the 186-feature matrix **identically** to training: fill the 17 augmented and new-feature gaps with the **saved train medians**, `transform` (never `fit`) the 183 columns with the saved QuantileTransformer.
3. One forward pass over the **whole graph**; take softmax illicit probability for the Class-3 nodes.
4. Apply the validated threshold **0.90** (no tuning on Class 3).
5. Save `outputs/unknown_transaction_risk_scores.csv` (`txId`, `Time step`, `illicit_risk_score`, `risk_level`, `flagged_at_validation_threshold`).
6. Pick the **top 20** cases for forensic profiling.

**Result:** **12,344 of 157,205 (7.85 %)** unknown transactions score ≥ 0.90.

**How to interpret:** 7.85 % is *not* an estimated illicit rate. There are no labels to check. On the labelled test period the same operating point had precision 0.608 (seed 42), so many flags are expected to be false alarms. It is a **prioritisation list**.

---

### Phase 12 – Forensic evidence layers (notebooks 06, 07, 08)

A bare score is not evidence, so we built layers. **They are never merged** (details in Section 10).

**Notebook 06 – descriptive profile of the top 20.** For each top-20 case: financial, structural, temporal and network indicators, plus the shared pattern. Key finding: **100 % of the top-20 have the fingerprint "1 input address + 1 output address + first-ever appearance"**. In labelled data this fingerprint is present in 7.93 % overall, **63.74 % of Class 1** and **1.90 % of Class 2** (≈ 33.6× more common in Class 1). It is an *association*, not proof (797 labelled licit transactions have it too). Outputs: `top20_forensic_case_profiles.csv`, `top20_forensic_case_report.csv`, `fingerprint_reference_analysis.csv`.

**Notebook 07 – saturation and attribution.**

* **Saturation.** 579 transactions print a score of exactly 1.000000; 2,222 are ≥ 0.999; 5,320 are ≥ 0.99. Are they all identical? **No.** The top-20 illicit logits range 1.77–6.07, logit margins 14.82–21.12, and all 19 adjacent pairs remain distinguishable at 6 decimals. So 1.0 is *softmax saturation*, and cases should be ranked by logit margin.
* **Representative cases** (a documented deterministic rule, not cherry-picking): top 5 by logit margin; up to 3 with the largest standardised distance from the top-20 centroid on `FIN5, total_BTC, fees, NET2, TMP5`; at least one case at time step 42 and one at time step 46; plus the highest-`FIN5` case. Result: **99942236, 99942297, 99942037, 99942047, 99942248, 196098540, 15340246, 191501490**.
* **Attribution method (feature occlusion).** Replace one feature with a *train-only baseline* (median for continuous, mode for binary), rerun the frozen model on the full graph, record `Δ = perturbed illicit logit − original illicit logit`. For the 8 cases this was done over all **186** inputs (`top_forensic_model_attributions.csv`). Sign: **negative Δ** means the transaction's own value pushes the illicit logit *up* relative to the baseline.

**Notebook 08 – reference-based unusualness.**

* Reference population = **overall labelled (Class 1 + 2)**; Class 3 never included. Because the 519 licit transactions with missing augmented data (and therefore no address-derived features) are excluded, the statistics are computed on **46,045** transactions with observed raw values; all 4,545 illicit are kept.
* **33 features** analysed: 17 financial, 6 structural, 8 temporal (including `Time step`), 2 network. `Local_feature_*` are excluded (meanings unverified).
* For each continuous feature: the transaction's **percentile** within the labelled distribution (`scipy.stats.percentileofscore(kind="mean")`), plus overall / Class 1 / Class 2 **medians**. HIGH ≥ 95th percentile, LOW ≤ 5th, otherwise NOT_EXTREME. Binary features (`STR2`, `TMP6_is_first_appearance`) use **prevalence** instead.
* Across the 8 representative cases × 31 continuous features = **248 checks: 19 HIGH, 11 LOW, 210 NOT_EXTREME**. Over the top 20: `FIN6` (fee rate) and `TMP5` (prior receiver transactions) are HIGH in **14/20** each.
* Files: `reference_population_statistics.csv`, `reference_binary_statistics.csv`, `case_feature_percentile_analysis.csv`, `top20_batch_percentile_analysis.csv`, `combined_case_interpretation_summary.csv`.

**Hard lesson from this phase:** *"FIN3 = 1.0"* looks dramatic (all input value in one input) but sits at the **73rd percentile** (NOT_EXTREME) — many normal transactions look the same. An observed value is **not** abnormal just because it equals 1 or is large; only its percentile says so. That is why the analyzer separates "observed" from "unusual".

---

### Phase 13 – The interactive analyzer, version by version (notebook 08)

The function `analyze_transaction(tx_id)` was rebuilt several times because early versions were misleading. Knowing this history explains the current design.

| Version | Problem the user saw | Fix |
|---|---|---|
| v1 | "Same reason for every transaction, only checks FIN3." Output looked templated. | Stopped printing raw values as if they were evidence. |
| v2–v3 | Observed values, unusualness and model sensitivity were mixed together. | **Four separate layers:** A observed behaviour → B reference-based unusualness → C case-specific model sensitivity → D final interpretation. Banned phrases like "most abnormal category overall"; added the exact wording "No extreme behaviour detected in this category." Added risk bands LOW/MODERATE/HIGH. |
| v4 | Attribution was only available for the 8 precomputed cases ("attribution: none available" for others). | **Live attribution** inside the notebook: occlusion is computed on demand for any transaction (≈ 7–8 s), using the identical method and verified against stored Notebook-07 output for 196098540 (max difference 0.000000). |
| v5 | Feature *names* repeated across HIGH-risk transactions (TMP5, FIN6 …). | Not a bug: HIGH cases share a behavioural archetype. Showed that the *numbers* differ per transaction. |
| v6 | "Also tell what is strange about that particular feature." | For every model-sensitive feature also print its percentile / HIGH-LOW status ("Reference standing"). |
| **v7 (current)** | "Don't just list names — say what the value is, how strange it is, compared with what." | Full **per-feature forensic block**: observed value, overall median, Class 1 median, Class 2 median, percentile, unusualness, plain-English interpretation, ratio-to-median where meaningful, and model sensitivity side by side. Band-specific final summaries (HIGH / MODERATE / LOW). |

The full usage guide is in Section 11.


---

## 7. The 14 transaction-time-safe features

Built in `03_Transaction_Time_Safe_Features.ipynb`, stored in `data/processed/transaction_time_safe_features_v1.parquet`. "t" means the transaction's own time step.

| ID | Name | Definition | Information boundary | Forensic intuition |
|---|---|---|---|---|
| **FIN3** | Largest input share | `in_BTC_max / in_BTC_total` | the transaction itself | 1.0 = all input value comes from one input; low = value pooled from many inputs |
| **FIN4** | Largest output share | `out_BTC_max / out_BTC_total` | the transaction itself | 1.0 = one output takes everything; low = value split across outputs |
| **FIN5** | Fee-to-value ratio | `fees / total_BTC` | the transaction itself | fee cost relative to the amount moved |
| **FIN6** | Fee rate | `fees / size` | the transaction itself | fee intensity per byte |
| **STR1** | Input/output address ratio | `num_input_addresses / num_output_addresses` | the transaction itself | > 1 fan-in (many → few), < 1 fan-out (few → many), = 1 balanced |
| **STR2** | Same-transaction address reuse | 1 if an address appears on both the input and the output side of the same transaction | edge files, same transaction | self-transfer / change-like patterns |
| **TMP1** | Input-address age | `t −` earliest time step of the input address's activity in **either role** | `≤ t` | how old (experienced) the funding address is; 0 = brand new |
| **TMP2** | Output-address age | same, for the output address | `≤ t` | how old the receiving address is |
| **TMP4** | Prior sender transactions | number of *other* transactions where the (input-side) address acted as sender | `≤ t`, self excluded | history of the funding side |
| **TMP5** | Prior receiver transactions | number of *other* transactions where the (output-side) address acted as receiver | `≤ t`, self excluded | history of the receiving side (a "busy" collector address has a big number) |
| **TMP6** | Time since last activity | time steps since the address was last active | **strictly `< t`** | recency; **undefined for first appearances (84.53 %)** |
| **TMP7** | Distinct active time steps | number of distinct time steps the address has appeared in | `≤ t` | breadth of the address's history |
| **NET1** | Input-side linked transactions | other historical transactions connected through shared input-side addresses | `≤ t`, current tx excluded | local network connectivity (input side) |
| **NET2** | Output-side linked transactions | same, output side | `≤ t`, current tx excluded | local network connectivity (output side) |
| (indicator) **TMP6_is_first_appearance** | First-ever appearance | 1 when TMP6 is undefined | derived | keeps the "missing because new" information |

Correlations among them (Spearman): TMP1–TMP7 0.999, TMP4–NET1 0.900, STR2–TMP4 0.795, FIN3–STR1 −0.718 (also STR2–NET1 0.737). **Therefore: never claim a single feature "causes" a result.**

---

## 8. All final results in one place

### 8.1 Classical baselines (test period)

| Model | Thr. | Precision | Recall | F1 | ROC-AUC | PR-AUC |
|---|---|---|---|---|---|---|
| Logistic Regression | 0.70 | 0.4049 | 0.4485 | 0.4256 | 0.8921 | 0.2889 |
| Random Forest | 0.50 | 0.8465 | 0.4730 | 0.6069 | 0.8530 | 0.5469 |

Random Forest is a single-split reference (no seed variance). It is stronger than GraphSAGE on precision, F1 and PR-AUC. Say so.

### 8.2 GraphSAGE – RobustScaler era vs final

| Setting | Seeds | Test PR-AUC | Test ROC-AUC | Test F1 | Thresholds resolved |
|---|---|---|---|---|---|
| A1 / A2 / B (RobustScaler) | 42 | 0.1870 / 0.2911 / 0.1877 | 0.8294 / 0.8190 / 0.8231 | 0.3168 / 0.3508 / 0.2912 | 2 yes, B no |
| B (RobustScaler) | 4 | 0.2212 ± 0.0285 | 0.8296 ± 0.0109 | 0.3113 ± 0.0184 | 1 of 4 |
| **B + QuantileTransformer (final)** | 4 | **0.5165 ± 0.0072** | **0.8368 ± 0.0099** | **0.5317 ± 0.0180** | **4 of 4** |

Mean test precision ≈ 0.634, recall ≈ 0.458 for B + QT (computed from `gnn_quantile_multiseed_results.csv`).

### 8.3 Ablations under QuantileTransformer

See Phase 9 table. Summary: removing Temporal lowers ROC-AUC in every run; PR-AUC and F1 are indistinguishable across variants; A2-QT ≈ B-QT on PR-AUC/F1.

### 8.4 Class-3 inference and forensic findings

| Item | Value |
|---|---|
| Unknown transactions scored | 157,205 |
| Flagged HIGH at 0.90 | **12,344 (7.85 %)** |
| Displayed exactly 1.000000 / ≥ 0.999 / ≥ 0.99 | 579 / 2,222 / 5,320 |
| Top-20 illicit logits; logit margins | 1.77–6.07; 14.82–21.12; 19/19 adjacent pairs distinguishable |
| Representative cases | 8 (rule in Phase 12) |
| Reference checks (8 cases × 31 continuous features) | 248 → 19 HIGH, 11 LOW, 210 NOT_EXTREME |
| FIN6 HIGH / TMP5 HIGH in top 20 | 14/20 each |
| Fingerprint (1 input, 1 output, first appearance) | top-20 100 %; overall labelled 7.93 %; Class 1 63.74 %; Class 2 1.90 % (≈ 33.6×) |

### 8.5 Worked example – transaction 196098540 (Class 3, time step 46, score 1.000000, HIGH)

| Feature | Observed | Overall median | Class 1 median | Class 2 median | Percentile | Unusualness | Model sensitivity Δ |
|---|---|---|---|---|---|---|---|
| Prior Receiver Transactions (TMP5) | 320 | 0 | 3 | 0 | 99.94 | HIGH | −0.4102 |
| Output Address Age (TMP2) | 38 | 0 | 0 | 0 | 99.97 | HIGH | +0.2065 |
| Fee-to-Value Ratio (FIN5) | 0.1744 | 0.0009 | 0.0023 | 0.0008 | 96.02 | HIGH | −0.0161 |
| Total input BTC | 0.0059 | 0.3816 | 0.1236 | 0.4824 | 5.00 | LOW | −0.0138 |
| Largest Input Share (FIN3) | 1.0 | 1.0 | 1.0 | 0.9998 | 73.28 | **NOT_EXTREME** | −0.0906 |
| Input Address Count | 1 | 1 | 1 | 2 | 26.72 | NOT_EXTREME | −0.1843 |
| Fee Rate (FIN6) | 4.0×10⁻⁶ | 1.03×10⁻⁶ | 1.05×10⁻⁶ | 8.98×10⁻⁷ | 94.47 | NOT_EXTREME (just below 95) | −0.1820 |

**Reading it:** TMP5 = 320 prior receiver transactions is in the extreme upper tail (the medians are 0 / 3 / 0) *and* the model is most sensitive to it. FIN3 equals 1.0 but is **not** unusual, yet the model still reacts to it — which is why "unusual" and "model-sensitive" are separate claims. For 81 of the 186 model inputs the measured change was exactly zero (zero ≠ irrelevant).

---

## 9. The frozen model and how to reload it

### 9.1 What "frozen" guarantees

* The model weights, the transformer, the medians, the column order and the threshold are **fixed files**. Inference only calls `transform`/`predict`, never `fit`/`train`.
* Seed 42 was frozen for determinism; its metrics: best epoch 81, val PR-AUC 0.8923, threshold 0.90, test precision 0.6080, recall 0.4485, F1 0.5162, ROC-AUC 0.8371, PR-AUC 0.5063.

### 9.2 Reload recipe (annotated skeleton – the real code is the cell "LOAD FROZEN MODEL FOR LIVE INFERENCE" in notebook 08)

```python
import json, joblib, torch, torch.nn as nn, torch.nn.functional as F
from torch_geometric.nn import SAGEConv

ARTIFACT_DIR = r"...\outputs\gnn_B_quantile_seed42"

# 1) model + threshold
ckpt = torch.load(f"{ARTIFACT_DIR}/model_checkpoint.pt", weights_only=False)
arch = ckpt["architecture"]                       # in_dim=186, hidden_dim=64, out_dim=2, dropout=0.3
model = GraphSAGENet(arch["in_dim"], arch["hidden_dim"], arch["out_dim"], arch["dropout"])
model.load_state_dict(ckpt["model_state_dict"]); model.eval()
THRESHOLD = ckpt["selected_threshold"]            # 0.90

# 2) frozen preprocessing
qt   = joblib.load(f"{ARTIFACT_DIR}/quantile_transformer.joblib")
meds = joblib.load(f"{ARTIFACT_DIR}/median_imputation.joblib")   # augmented_medians, new_feature_medians, ...
feature_cols = json.load(open(f"{ARTIFACT_DIR}/feature_columns.json"))   # 186 names, in order
scale_cols   = json.load(open(f"{ARTIFACT_DIR}/scaling_columns.json"))   # 183
binary_cols  = json.load(open(f"{ARTIFACT_DIR}/binary_columns.json"))    # 3

# 3) rebuild the raw 186-column table EXACTLY like training (merge safe features, add
#    augmented_features_missing, fill gaps with the SAVED medians), then:
X[scale_cols] = qt.transform(X[scale_cols])        # transform ONLY - never fit
x = torch.tensor(X[feature_cols].astype("float32").values)

# 4) graph = same edge_index as training (txs_edgelist mapped to node indices)
with torch.no_grad():
    logits = model(x, edge_index)
score = F.softmax(logits, dim=1)[:, 1]            # illicit-risk score for every node
```

Two safety checks to repeat whenever you touch this:
1. `x.shape == (203769, 186)` and the column order equals `feature_columns.json`.
2. The scores of the first 200 stored Class-3 transactions reproduce `unknown_transaction_risk_scores.csv` (max difference < 10⁻⁵).

---

## 10. The forensic evidence layers

The output for one transaction is built from **five different questions**. Each layer has its own source and its own allowed wording. **Never merge them.**

| Layer | Question | Computed from | Allowed wording | Not allowed |
|---|---|---|---|---|
| **A. Observed behaviour** | What does the transaction look like? | raw feature values | "has 320 prior receiver transactions" | "abnormal", "suspicious" (no reference yet) |
| **B. Reference-based unusualness** | How unusual is each value compared with the labelled population? | percentile vs. Class 1 + 2 reference; HIGH ≥ 95, LOW ≤ 5 | "at the 99.94th percentile; unusually high" | "fraud-like" |
| **C. Class association** | Is the behaviour more common in Class 1 than Class 2? | fingerprint prevalence tables | "63.74 % of Class 1 vs 1.90 % of Class 2" | "so this transaction is illicit" |
| **D. Model sensitivity** | Does the frozen model's output change when this feature is set to a baseline? | occlusion Δ in illicit logit | "case-specific model-sensitive contributor" | "caused", "proves", "explains the fraud" |
| **E. Forensic interpretation** | What does it all mean for prioritisation? | synthesis of A–D | "supports forensic prioritisation; does not establish illicit activity" | "fraud", "not fraud", "legitimate", "confirmed illicit" |

**Rules that keep it honest**

* A feature can be **unusual but not model-sensitive**, or **model-sensitive but not unusual** (FIN3 above). Report both facts.
* Only show an attribution that was actually computed. If not available: "Case-specific attribution unavailable for this transaction."
* Do not force a suspicious feature into every category; if nothing crosses the thresholds say **"No extreme behaviour detected in this category."**
* Ratios like "X times the median" are shown only when the median is non-zero, the signs agree and the ratio is meaningful (never for binary features).
* Reference statistics come from labelled data only; Class 3 never defines them.

---

## 11. The interactive analyzer

### 11.1 Using it

1. Open `notebooks/08_Reference_Behavioural_Analysis.ipynb`, **Restart Kernel and Run All** (the analyzer needs variables created by earlier cells: `tx_data`, `merged_indexed`, `txid_to_node`, `full_probs`, the frozen `model`, `x_infer`, `edge_index`, `VALIDATED_THRESHOLD`, `build_case_rows`, `display_name`, the `interp_*` helpers, `fingerprint_df`, `compute_live_attribution`, `ATTR_ALL`, `BINARY_FEATURES`).
2. In a new cell:
   ```python
   result = analyze_transaction(196098540)      # any txId from the 203,769 transactions
   ```
3. It prints a long report and returns a dict (`risk_band`, `score`, `attribution_available`, `key_contributors`, `summary_text`, …).

**Known-good test transactions** (these are used as validation in the notebook):

| txId | Expected band |
|---|---|
| 230670900 | LOW |
| 86815155 | MODERATE (score 0.522958) |
| 403235564 | HIGH (score 1.0) |
| 196098540 | HIGH |
| 99943310 | HIGH (live attribution works for it) |

An unknown ID prints "Transaction ID not found…" and returns `{"found": False}`.

### 11.2 What it prints, section by section

1. **TRANSACTION OVERVIEW** – ID, class (Class 1 / 2 / 3), time step, score, validated threshold, risk band.
2. **OBSERVED BEHAVIOURAL CHARACTERISTICS** – plain values for financial / structural / temporal / network features with human-readable names (never bare codes as the main label). *Not* a claim of abnormality.
3. **REFERENCE-BASED UNUSUALNESS** – per category, only features with percentile ≥ 95 or ≤ 5 (max 3 per category), each as a full block: observed value, overall median, Class 1 median, Class 2 median, percentile, unusualness, interpretation, ratio to the median (if meaningful), and a model-sensitivity line.
4. **CLASS ASSOCIATION** – the 1-in/1-out/first-appearance fingerprint prevalence in Class 1 vs Class 2, if the transaction has that fingerprint.
5. **CASE-SPECIFIC MODEL-SENSITIVE CONTRIBUTORS** – computed **live** for this transaction by occlusion over 32 named behavioural features (17 financial, 6 structural, 7 temporal, 2 network; `Time step` is not included). Up to 3 per category, each shown with its reference standing.
6. **MODEL ASSESSMENT / WHY THIS TRANSACTION RECEIVED THIS ASSESSMENT** – compact category-by-category recap.
7. **FINAL FORENSIC SUMMARY** – band-specific text:
   * **HIGH (≥ 0.90):** numbered strongest reference-based findings with numbers + attribution list + "supports prioritisation; does not establish illicit activity".
   * **MODERATE (0.50 to < 0.90):** top findings and why the score stays under the validated threshold.
   * **LOW (< 0.50):** per-category "no extreme features detected" and "no strong combination of unusual behaviours".

**Risk bands.** LOW < 0.50, MODERATE 0.50 – < 0.90, HIGH ≥ 0.90. Only **0.90** is a validated operating threshold; 0.50 is a presentation midpoint and must never be called "validated".

### 11.3 How the live attribution works (so you can debug it)

```python
def compute_live_attribution(node_idx):
    base_logit = full_illicit_logit[node_idx]
    original = x_infer[node_idx].clone()
    try:
        for feat in ATTR_ALL:                       # 32 features
            i = col_index_map[feat]
            if abs(original[i] - baseline_vector[i]) < 1e-9:
                delta = 0.0                         # already equals the baseline
            else:
                x_infer[node_idx, i] = baseline_vector[i]       # occlude ONE feature
                new_logit = model(x_infer, edge_index)[node_idx, 1]
                x_infer[node_idx, i] = original[i]              # restore
                delta = new_logit - base_logit
            ...
    finally:
        x_infer[node_idx] = original                # always restore
```

* `baseline_vector` = **training-only** median (continuous) or mode (binary), computed on the 29,894 training rows in the transformed space.
* One full-graph forward pass per feature → ≈ 32 passes ≈ 7–8 s.
* Sign: negative Δ = this transaction's own value pushes the illicit logit up relative to the baseline.
* This is the **same method** as notebook 07 (verified: max difference 0.000000 for 196098540), just not limited to precomputed cases.

### 11.4 If you edit the analyzer

* Find cells by **content**, not by index (`'def analyze_transaction(tx_id):'`, `'def compute_live_attribution'`, `'LOAD FROZEN MODEL FOR LIVE INFERENCE'`). Cell numbers have changed several times.
* Don't change: the frozen model, preprocessing, thresholds, reference-population definition, attribution method.
* After editing, re-run the five known-good transactions above and check that bands still differ, FIN3 = 1.0 for 196098540 stays NOT_EXTREME (73.28), and no output says "fraud".
* Close the notebook in VS Code/Jupyter **before** an external tool edits the file — see "file revert" in Section 12.


---

## 12. Failures, dead ends and gotchas

This is the honest log. Reading it will save you days. Format: **what happened → why → how it was fixed → lesson.**

### 12.1 Data and pipeline failures

| # | What happened | Root cause | Fix | Lesson |
|---|---|---|---|---|
| 1 | We "engineered" input/output counts and degrees | The dataset already had them (`num_input_addresses`, `in_txs_degree`, …) | Dropped the claim of novelty | Check existing columns first |
| 2 | 965 transactions had all 17 augmented features missing | They have no address records at all | Missingness indicator + train-median imputation | Missing ≠ random; tell the model it was missing |
| 3 | `MemoryError` joining wallet data to transactions | `wallets_features.csv` has duplicate `(address, Time step)` rows (up to 568×) → many-to-many join | `drop_duplicates(subset=["address","Time step"])` (verified lossless: duplicates are identical) | Count duplicates before every join |
| 4 | A live variable had 4,686,055 rows instead of 477,117 | Stale kernel after out-of-order cell execution | Restart kernel, run top to bottom | Always restart + run all after a long gap |
| 5 | A Random-Forest R² test ran 77 minutes and was killed | 144 targets, 200k rows, unthrottled | 25,000-row subsample, capped depth, `n_jobs=2` → < 3 min, same conclusion | Subsample for audits, document it |
| 6 | Re-running the "same" Random Forest gave a different confusion matrix | `sort_values` default quicksort is **not stable** → ties ordered differently | Sort by `[Time step, txId]` with `kind="mergesort"` | Make every sort deterministic |
| 7 | Dictionary labels looked wrong (`Local_feature_41` "incoming" vs `47` "outgoing" both match the *sender* count) | Documentation inconsistency (collinearity ruled out, Spearman −0.11) | Trust empirical evidence, never invent meanings | Verify documentation, don't assume it |
| 8 | Single-column reconstruction of inherited features mostly failed (Spearman 0.01–0.82) | Features are weighted combinations, not copies | Ceiling test: joint RF regression, R² 0.80–0.98 | One weak test ≠ no relationship; design a stronger one |

### 12.2 Feature-engineering failures

| # | What happened | Root cause | Fix | Lesson |
|---|---|---|---|---|
| 9 | **FIN2** (output-value concentration / HHI) impossible | Files hold only min/max/mean/median/total of outputs, not each output | Dropped it (no proxy) | Don't ship a metric that isn't what it claims |
| 10 | **TMP1/TMP2 bug** — age computed from one role only | A→output at step 2, A→input at step 7 gave age 0 instead of 5 | Combined any-role activity table; 3,174 TMP1 and 688 TMP2 values changed, all increases | Test with a hand-made counter-example |
| 11 | Hub addresses made the NET1/NET2 self-join explode (≈ 6 GB memory) | Quadratic pair count | Per-address dictionaries + set unions, never a Cartesian product | Estimate join size first |
| 12 | After the TMP1 fix, TMP1–TMP7 correlation became 0.999 | Both now derive from the same activity table | Flagged as near-total redundancy; **left unresolved**, both kept | Surface redundancy; decide explicitly |
| 13 | Value-driven flagged features (23, 25, 29, 30, 65) have no safe replacement | No per-address BTC values in the edge files | Documented as a limitation | Some leakage can't be repaired with available data |

### 12.3 Modelling failures

| # | What happened | Root cause | Fix | Lesson |
|---|---|---|---|---|
| 14 | Loss was in the thousands–hundreds of thousands | **RobustScaler** divided rare outliers by a near-zero IQR (max 2.29×10¹⁰) | **QuantileTransformer** (max 5.1993) → test PR-AUC 0.22 → 0.52 | A "preprocessing" fix can matter more than the model |
| 15 | Threshold ended at 0.99 ("unresolved") in 4 of 7 first experiments | F1 kept rising to the edge of the grid | Reported honestly as unresolved; after QT all 4 seeds resolved | Never present a boundary value as the optimum |
| 16 | Validation and test PR-AUC moved in opposite directions (A1→A2, B-Temporal) | Single seed + distribution shift + unstable thresholds | Multi-seed runs | Never rank experiments from one seed |
| 17 | B-Temporal's single run looked "best" (0.2614) | It was within seed noise (0.1981 ± 0.0454 over 4 seeds) | Don't over-interpret | Report mean ± sd |
| 18 | GraphSAGE lost to Random Forest | Hypotheses: same-step-only edges, low degree, heavy tails, shift, RF scale-invariance | Kept GNN (goal is graph-aware forensics); reported RF honestly | Don't hide a stronger baseline |
| 19 | A1 precision/recall in the CSV differ from the typed notebook table (0.2564/0.4142 vs 0.2384/0.4657) | Notebook 04 was re-executed on 29 Sep; the CSV was regenerated; PR-AUC and ROC-AUC unchanged | Documented here ⚠️ | Compare *metrics*, not checkpoint bytes (checkpoint files differ byte-wise on re-run) |
| 20 | Seed-42 row in `gnn_quantile_multiseed_results.csv` has rounded values and blank loss columns | It was filled from the earlier single-seed run | Documented ⚠️ | If you re-run, regenerate that row programmatically |
| 21 | Notebook 04's limitations list says "5 of 7 unresolved", its table shows 4 | Counting slip | Use the table (4: B, B-Financial, B-Structural, B-Network) ⚠️ | Re-derive counts from the CSV |
| 22 | Top cases all print score 1.000000 | Softmax saturation (logit margins 14.8–21.1 differ) | Rank by logit margin | Display rounding hides real differences |

### 12.4 Forensic-layer and tooling failures

| # | What happened | Fix / lesson |
|---|---|---|
| 23 | First analyzer gave "the same reason for every transaction" and always focused on FIN3 | Rebuilt into 4 separate layers; FIN3 = 1.0 sits at the 73rd percentile (NOT_EXTREME) — raw value ≠ unusual |
| 24 | Attribution was missing for transactions outside the 8 precomputed cases | Live on-demand occlusion (verified identical to stored Notebook-07 values) |
| 25 | Same feature *names* repeated for HIGH cases (TMP5, FIN6, …) | Not a bug — shared archetype; numbers differ per case |
| 26 | **Notebook file kept reverting** to an older version after external edits | A copy of the notebook was open in VS Code/Jupyter; its stale buffer overwrote the file on save. **Close the notebook everywhere before editing it with another tool**, and verify the file on disk afterwards |
| 27 | Stray `nbconvert_*.log` files appeared in `notebooks/` | Execution logs written into the project folder; deleted. Keep logs out of the project |
| 28 | `PermissionError` opening a `.docx`/file inside OneDrive | OneDrive/Word locked it; copy it to a temp folder and read the copy |
| 29 | `UnicodeEncodeError` printing "≈" or "→" on Windows | Console code page cp1252; run Python with `PYTHONIOENCODING=utf-8` or write to a file |
| 30 | Notebooks fail on another computer | Hard-coded `C:\Users\koush\…` paths — replace them (Section 4.3) |
| 31 | `analyze_transaction` or helpers "not defined" | You didn't run the earlier cells; analyzer depends on globals — **Run All** |
| 32 | Mean precision/recall quoted as 0.637/0.452 in an early brief | Recomputed from the CSV: **0.634/0.458**; fingerprint ratio is ≈ **33.6×**, not 33.5× | Always recompute from files |

### 12.5 General debugging checklist

1. Restart kernel → Run All.
2. Check shapes first (`x.shape == (203769, 186)`, `edge_index.shape == (2, 234355)`).
3. Check for NaN/Inf (`torch.isfinite(x).all()`).
4. Check the split sizes (29,894 / 7,829 / 8,841) and class weights (0.5655 / 4.3174).
5. Check that every `fit` call uses **training rows only**.
6. Compare with a known number from this guide before trusting anything new (e.g. seed-42 test PR-AUC 0.5063).

---

## 13. Alternatives we considered and next steps

### 13.1 Decisions: what we chose, what else was possible

| Decision | We chose | Other possible options | Why not / status |
|---|---|---|---|
| Split | Chronological 1–34 / 35–41 / 42–49 | Random split; rolling-origin / multiple time boundaries; per-time-step CV | Random leaks time; rolling origin **not done** (good next step) |
| Imbalance handling | Class-weighted cross-entropy | SMOTE, undersampling, focal loss | Rule: no SMOTE; focal loss **untested** |
| Scaling | QuantileTransformer (normal, 1000 quantiles) | RobustScaler (failed), StandardScaler, log-transform + scale, PowerTransformer, clipping | Others **untested**; QT solved the diagnosed fault |
| Model | 2-layer GraphSAGE (186→64→2) | GCN, GAT, GIN, temporal GNNs, heterogeneous GNN with address nodes, XGBoost/LightGBM | Architecture search **not done** (stated limitation) |
| Graph | Directed tx→tx, no reverse edges | Add reverse edges (undirected), add address nodes, k-hop precomputed features | Not tried |
| Threshold | Max validation F1, grid 0.1–0.9 then 0.80–0.99 | Fixed 0.5; cost-based; top-k (investigator capacity); per-period thresholds | Top-k/precision@k **not evaluated** |
| Reference population | Overall labelled (+ Class 1 / Class 2 medians) | Per-time-step reference; per-feature matched peers | Per-step reference **not done** |
| Explanation | Occlusion (train-only median/mode baseline) | SHAP (for RF), GNNExplainer, integrated gradients, attention | Baseline-sensitivity of occlusion **not tested** |
| Temporal availability | Empirical audit + safe replacements | Drop all inherited features; trust them | Chose evidence-based middle path |

### 13.2 Ideas to continue the project (roughly by value)

1. **Fair tabular comparison.** Train Random Forest / gradient boosting on **representation B** (the 186 features) with the same split. Random Forest has so far only seen the 184-feature A1 representation, so the "RF vs GNN" comparison is not like-for-like.
2. **Multiple time boundaries** (rolling-origin evaluation) to separate real generalisation from the 11.58 % → 4.61 % prevalence drop.
3. **More seeds** (e.g. 10) and confidence intervals for the final model and ablations.
4. **Precision@k / top-k evaluation:** investigators can only check so many cases. How many of the top 100 / 1,000 flagged *labelled* transactions are illicit?
5. **Simple-rule baseline:** in labelled data the fingerprint (1 input, 1 output, first appearance) covers 3,694 transactions of which 2,897 are illicit → rule "precision" ≈ 78.4 %, "recall" ≈ 63.7 % on the *whole* labelled set. This was **not** evaluated on the chronological test split; do that before drawing any conclusion. It tells you how much of the model's value is just this pattern.
6. **Architecture experiments:** add reverse edges, GAT/GCN, 3 layers, a heterogeneous graph with address nodes.
7. **Extend the feature audit** to the 150 inherited features not examined in depth, or find extra data for safe replacements of the value-driven features (23, 25, 29, 30, 65) and FIN2.
8. **Redundancy decision:** TMP1 vs TMP7 (0.999) — drop one and re-run the ablation.
9. **Explanation robustness:** repeat attribution with other baselines (mean, zero, class-specific) and see if the top contributors stay the same.
10. **Per-time-step unusualness:** compare a transaction with the *same time step's* labelled transactions.
11. **Batch analyzer:** run `analyze_transaction` logic for all 12,344 HIGH transactions and write a CSV (percentile columns + top contributors) for easy sorting.
12. **Engineering clean-up:** move shared helpers (graph building, preprocessing, `train_experiment`, analyzer) into a `src/` package, make paths configurable, add a few unit tests. Notebook 04 re-executes everything including training — keep the heavy results in CSVs.
13. **Small app:** a Streamlit/Gradio front-end around `analyze_transaction`.

### 13.3 Before you change anything — checklist

- [ ] I re-read Section 5 (the rules).
- [ ] Every `fit` uses training rows only.
- [ ] Class 3 is not in any loss, metric or reference statistic.
- [ ] I didn't select any threshold using test labels.
- [ ] I compared my new numbers with the table in Section 8.
- [ ] I did not overwrite the frozen model folder or the baseline CSVs (copy to a new name for experiments).
- [ ] My wording says "suspicious / prioritise / model-sensitive", not "fraud".

---

## 14. Viva / review questions with answers

**Q1. What is the project in one sentence?**
A forensic decision-support system that scores Bitcoin transactions for suspicion using a graph neural network on transaction-time-safe behavioural features, and explains each flagged transaction with reference-based unusualness and model-sensitivity evidence — it never claims fraud.

**Q2. Why graphs?** Money moves between transactions; an output spent by another transaction is a natural edge. A GNN lets each transaction use its neighbours' information.

**Q3. Why GraphSAGE, and isn't it old?** It's a standard, well-understood neighbourhood-aggregation model. We deliberately don't claim novelty in the architecture; the contribution is the feature audit, preprocessing correction and forensic explanation layer.

**Q4. Why is accuracy not used?** Labelling everything licit already scores > 90 %. We use PR-AUC (primary), illicit-class F1, precision and recall; ROC-AUC for comparability.

**Q5. Why a chronological split?** A forensic model is applied to later data than it was trained on. Random splits would let the model see the future and overstate performance. The cost is distribution shift (illicit 11.58 % → 4.61 %).

**Q6. What is leakage and where did you find a risk?** Information in training that wouldn't exist in real use. Wallet-level statistics are static full-history snapshots (273,268 repeated addresses, 100 % unchanged), and 13 inherited features can be largely reconstructed from them (test R² 0.80–0.98 for the four tested). We say "strong evidence of a temporal-availability concern", not "proven leaked".

**Q7. How do you know your 14 features are safe?** They only use history up to the transaction's own time step (`≤ t`, TMP6 `< t`), enforced by assertions, validated by hand-traced transactions, and they don't use `wallets_features.csv`. We also caught and fixed a role-restriction bug in TMP1/TMP2.

**Q8. Why did the first GNN results look bad?** RobustScaler divided rare outliers by an almost-zero IQR, producing values up to 2.29×10¹⁰ and exploding loss. QuantileTransformer bounded everything at 5.1993 and test PR-AUC rose from ≈0.22 to ≈0.52.

**Q9. Random Forest beats your GNN. Why keep the GNN?** True on precision, F1 and PR-AUC; we report it. Random Forest is a single-split baseline on a different representation (A1); the project's goal is graph-aware forensic modelling and evidence generation, not leaderboard ranking. A like-for-like RF on representation B is listed as future work.

**Q10. Which features matter most?** We do **not** claim that. Families are correlated and PR-AUC/F1 don't change robustly under ablation. Removing temporal features consistently lowers ROC-AUC, but that's an association, not causality.

**Q11. How was the threshold chosen?** On validation only (best F1); 0.90 for the frozen seed-42 model. Never on test or on Class 3.

**Q12. What does 12,344 flagged mean?** 7.85 % of unknown transactions scored ≥ 0.90. It is not an illicit rate; there are no labels. On the labelled test period the same threshold had precision ≈ 0.61, so some flags will be false alarms.

**Q13. Why do many top cases show 1.0?** Softmax saturation. Their logit margins range 14.8–21.1, so they remain distinguishable; rank by logit margin.

**Q14. What is the fingerprint?** 1 input address + 1 output address + first-ever appearance. It appears in 100 % of the top-20 flagged cases, 63.74 % of labelled illicit, 1.90 % of labelled licit, 7.93 % overall. It's an association, not proof.

**Q15. How do you explain a transaction?** Five separate layers: observed behaviour, reference-based unusualness (percentile vs labelled population), class association, case-specific model sensitivity (occlusion), and a final interpretation. A feature can be unusual without being model-sensitive and vice versa.

**Q16. What is feature occlusion?** Set one feature to a training-only baseline, rerun the frozen model, measure the change in the illicit logit. Non-zero = model-sensitive. Not SHAP, not GNNExplainer, not causal.

**Q17. Why is "FIN3 = 1.0" not called abnormal?** It sits at the 73.28th percentile — many labelled transactions look the same. Only the percentile decides unusualness.

**Q18. How is the model reproducible?** Frozen checkpoint + QuantileTransformer + medians + column list + threshold. Reload reproduced test metrics exactly; a 200-node check had max difference 0.

**Q19. What are the main limitations?** One architecture, one chronological split, distribution shift, RF stronger on some metrics, unverified semantics of most inherited features, same-step-only edges, unknown class has no ground truth, attribution is sensitivity not causality, softmax saturation, not a legal verdict.

**Q20. What would you do next?** Fair RF/boosting on representation B, rolling-origin evaluation, more seeds, precision@k, architecture variants, extended feature audit, per-time-step references.

---

## 15. File-by-file reference

### 15.1 `notebooks/` result tables

| File | What it holds |
|---|---|
| `logistic_regression_baseline_results.csv`, `random_forest_results.csv` | Model 1 / Model 2 baselines (do not overwrite) |
| `gnn_experiment_results.csv` | The 7 original RobustScaler GraphSAGE experiments |
| `gnn_multiseed_robustness_results.csv` / `_summary.csv` | B and B-Temporal, 4 seeds, RobustScaler |
| `gnn_quantile_multiseed_results.csv` / `_summary.csv` | **Final** B + QuantileTransformer, seeds 7/21/42/84 |
| `gnn_a2_quantile_multiseed_results.csv` / `_summary.csv` | A2 + QuantileTransformer, 4 seeds |
| `gnn_quantile_ablation_results.csv` | first QT ablation pass, seed 42 only, four families |
| `gnn_quantile_ablation_multiseed_*.csv` | B-QT-Financial and B-QT-Network, 4 seeds |
| `gnn_quantile_ablation_remaining_multiseed_*.csv` | B-QT-Structural and B-QT-Temporal, 4 seeds |
| `gnn_training_curves.png` | training curves of the experiments |

### 15.2 `outputs/`

| File / folder | What it holds | Produced by |
|---|---|---|
| `gnn_B_quantile_seed42/` | the frozen pipeline (Section 9) | model materialisation |
| `gnn_checkpoints/` | `exp1…exp7` weights, `exp3b_B_quantile_model.pt`, `gnn_B_quantile_seed42.pt` | notebook 04 |
| `unknown_transaction_risk_scores.csv` | 157,205 rows: score, risk level, flag | 05 |
| `top_unknown_forensic_cases.csv` | the top-20 ranking | 05 |
| `top20_forensic_case_profiles.csv`, `top20_forensic_case_report.csv` | descriptive profiles + readable report | 06 |
| `class3_score_saturation_summary.csv` | saturation counts, logit ranges | 07 |
| `top_forensic_model_attributions.csv` | occlusion results for 8 cases × 186 inputs | 07 |
| `forensic_case_attribution_summary.csv` | top contributors per category per case | 07 |
| `forensic_analysis_plots/` | score distribution, margin-vs-score, top attributions | 07 |
| `reference_population_statistics.csv`, `reference_binary_statistics.csv` | medians/percentiles per population (overall, Class 1, Class 2) | 08 |
| `case_feature_percentile_analysis.csv` | percentiles for the 8 representative cases | 08 |
| `top20_batch_percentile_analysis.csv` | same for the top 20 | 08 |
| `fingerprint_reference_analysis.csv` | fingerprint counts and percentages | 08 |
| `combined_case_interpretation_summary.csv` | Notebook 07 + 08 evidence side by side | 08 |

### 15.3 Other

| Path | What it is |
|---|---|
| `data/processed/transaction_time_safe_features_v1.parquet` | the 14 safe features + indicator |
| `reports/Draft_Project_Report_Bitcoin_Forensics.docx` | the 12-page draft report |
| Review 1 slide deck (`Forensic_Analytics_Review_EllipticPP.pptx`, kept outside the project folder) | contains the architecture and workflow diagrams used in the report |
| `requirements.txt` | pinned library versions |

---

### Final words to the next developer

1. Trust numbers that come from files, not from memory — **recompute** when in doubt.
2. Every claim in this project is deliberately small and defensible. Keep it that way: *suspicious, prioritised, model-sensitive* — never *fraud*.
3. When something looks wrong (huge loss, 1.0 scores, repeated names), investigate before "fixing" — three of the biggest findings in this project (the leakage evidence, the RobustScaler pathology, the saturation) came from refusing to ignore something odd.

Good luck — and read Section 5 once more before you press Run.
