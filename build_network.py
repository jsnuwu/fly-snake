"""Extract the sub-circuit of the MaleCNS connectome that plays Snake -> snake/network.json.

Inputs  (eyes):   LC10a/LC10d (small moving object -> pursuit), LC4/LPLC2 (looming -> escape)
Outputs (motor):  DNa01/DNa02 (steering), DNp09 (forward pursuit), DNp01 (giant fiber / escape jump), MDN (backward)

Keeps every neuron that lies on a path input -> ... -> output of length <= 4 (with a minimum synapse count per
connection). Each neuron also gets its real soma position ("pos": [x, y] in 0..1, front view, aspect ratio kept)
for the brain view in the panel.
"""
import json
from collections import defaultdict

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.feather as feather

MIN_W = 5          # min synapses per connection to keep
MAX_HIDDEN = 4000  # cap on intermediate neurons
OUT = "snake/network.json"

INPUTS = {
    "LC10a": "target", "LC10d": "target",
    "LC4": "loom", "LPLC2": "loom",
}
OUTPUTS = {
    "DNa01": "steer", "DNa02": "steer",
    "DNp09": "forward",
    "DNp01": "escape",
    "MDN": "backward",
}
# sign of a synapse by the presynaptic neuron's transmitter
NT_SIGN = {"acetylcholine": 1.0, "gaba": -1.0, "glutamate": -1.0, "histamine": -1.0}

ann = pd.read_feather("data/annotations.feather")
nt = pd.read_feather("data/neurotransmitters.feather")[["body", "consensus_nt"]]
ann = ann.merge(nt, left_on="bodyId", right_on="body", how="left")
info = ann.set_index("bodyId")

print("loading weights ...")
pre_col, post_col, w_col = "body_pre", "body_post", "weight"
t = feather.read_table("data/weights.feather", memory_map=True)
t = t.filter(pc.greater_equal(t[w_col], MIN_W))
typed = pa.array(ann[ann.type.notna()].bodyId.to_numpy())
t = t.filter(pc.and_(pc.is_in(t[pre_col], typed), pc.is_in(t[post_col], typed)))
w = t.to_pandas()
del t
print("edges >= MIN_W between annotated bodies:", len(w))

inp = ann[ann.type.isin(INPUTS)].bodyId.to_numpy()
out = ann[ann.type.isin(OUTPUTS)].bodyId.to_numpy()

out_adj = defaultdict(list)
in_adj = defaultdict(list)
for a, b, c in zip(w[pre_col].to_numpy(), w[post_col].to_numpy(), w[w_col].to_numpy()):
    out_adj[a].append((b, c))
    in_adj[b].append((a, c))


def reach(seeds, adj, hops):
    """distance and accumulated synapse score from seeds"""
    dist, score = {s: 0 for s in seeds}, defaultdict(float)
    frontier = set(seeds)
    for h in range(1, hops + 1):
        nxt = set()
        for n in frontier:
            for m, c in adj[n]:
                score[m] += c
                if m not in dist:
                    dist[m] = h
                    nxt.add(m)
        frontier = nxt
    return dist, score


fd, fs = reach(inp, out_adj, 3)
bd, bs = reach(out, in_adj, 3)
hidden = [n for n in fd if n in bd and fd[n] + bd[n] <= 4 and fd[n] > 0 and bd[n] > 0]
hidden.sort(key=lambda n: -min(fs[n], bs[n]))
hidden = hidden[:MAX_HIDDEN]
print("inputs", len(inp), "outputs", len(out), "hidden", len(hidden))

keep = list(inp) + [n for n in hidden if n not in set(inp) | set(out)] + list(out)
idx = {b: i for i, b in enumerate(keep)}

neurons = []
for b in keep:
    r = info.loc[b]
    t = r["type"] if isinstance(r["type"], str) else "?"
    role = INPUTS.get(t) and "in:" + INPUTS[t] or OUTPUTS.get(t) and "out:" + OUTPUTS[t] or "hidden"
    neurons.append({
        "id": int(b), "type": t, "side": r["somaSide"] if isinstance(r["somaSide"], str) else "?",
        "nt": r["consensus_nt"] if isinstance(r["consensus_nt"], str) else "?",
        "cls": r["superclass"] if isinstance(r["superclass"], str) else "?",
        "role": role,
    })

# real soma positions (x = left/right, y = top/bottom); neurons without one get the mean of their role and side
xy = np.full((len(keep), 2), np.nan)
for i, v in enumerate(info.loc[keep, "somaLocation"]):
    if v is not None and len(v) == 3:
        xy[i] = v[0], v[1]
lo, hi = np.nanmin(xy, 0), np.nanmax(xy, 0)
xy = (xy - lo) / (hi - lo).max()
groups = np.array([f'{n["role"]}|{n["side"]}' for n in neurons])
for i in np.where(np.isnan(xy[:, 0]))[0]:
    xy[i] = xy[(groups == groups[i]) & ~np.isnan(xy[:, 0])].mean(0)
for n, (x, y) in zip(neurons, xy):
    n["pos"] = [round(float(x), 4), round(float(y), 4)]

sub = w[w[pre_col].isin(idx) & w[post_col].isin(idx)]
pre = sub[pre_col].map(idx).to_numpy()
post = sub[post_col].map(idx).to_numpy()
cnt = sub[w_col].to_numpy().astype(float)
sign = np.array([NT_SIGN.get(neurons[p]["nt"], 0.0) for p in pre])
# normalise by each neuron's total synaptic input inside the sub-circuit
tot = np.bincount(post, weights=cnt, minlength=len(keep))
wn = sign * cnt / np.maximum(tot[post], 1)
mask = wn != 0
edges = np.stack([pre[mask], post[mask], np.round(wn[mask], 4)], 1)
print("edges in sub-circuit:", len(edges))

json.dump({"neurons": neurons, "edges": edges.tolist()}, open(OUT, "w"), separators=(",", ":"))
print("wrote", OUT)
