# MoRI

Web app for brain MRI viewing, brain-age prediction (SynthBA) and morphometry.

Backend is Django + DRF. Frontend is React (Vite).

## Setup

```bash
python3.10 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp backend/.env.example backend/.env
cd backend
python manage.py migrate
python manage.py runserver
```

```bash
cd frontend
yarn install
yarn dev
```

SynthBA weights are not in the repo (they are ~100MB each). Put `synthba-g.pth` / `synthba-u.pth` into `backend/SynthBA/checkpoints/` if you need age prediction.
