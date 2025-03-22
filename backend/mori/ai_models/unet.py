import torch
from monai.networks.nets import UNet
from monai.transforms import Compose, LoadImage, EnsureChannelFirst, Resize, NormalizeIntensity, ToTensor
import nibabel as nib
import numpy as np

# Load the model architecture
# unet = UNet(
#     spatial_dims=3,
#     in_channels=4,  # BraTS uses 4 modalities: T1, T1ce, T2, FLAIR
#     out_channels=3,  # Tumor subregions (enhancing, edema, necrotic)
#     channels=(16, 32, 64, 128, 256),
#     strides=(2, 2, 2, 2),
# )

# checkpoint = torch.load("/Users/ilabetaev/labjourn/data/brats_mri_segmentation/models/model.ts", map_location="cpu")

# # Print the keys to understand the structure
# print(checkpoint.keys())  # Should contain either "model", "state_dict", etc.


# Load pretrained weights (replace with the actual path)
# model.load_state_dict(torch.load("/Users/ilabetaev/labjourn/data/brats_mri_segmentation/models/model.pt", map_location="cpu"))
pretrained_ts="/Users/ilabetaev/labjourn/data/brats_mri_segmentation/models/model.ts"
# model.eval()  # Set the model to evaluation mode
unet = torch.jit.load(pretrained_ts)

# # If it contains 'state_dict', print available weight keys

# torch.save(state_dict, "extracted_weights.pth")