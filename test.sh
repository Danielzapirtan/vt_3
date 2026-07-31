python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# only on Apple Silicon Macs, optionally:
pip install -r requirements-mlx.txt
python app.py
