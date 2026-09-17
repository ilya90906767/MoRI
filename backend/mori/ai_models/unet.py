import os
import torch

pretrained_ts = os.environ.get(
    "UNET_WEIGHTS",
    os.path.join(os.path.dirname(__file__), "model.ts"),
)
unet = torch.jit.load(pretrained_ts)
