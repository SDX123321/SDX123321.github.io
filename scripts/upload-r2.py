"""Upload site images to Cloudflare R2. Reads credentials from env vars."""
import boto3, os, sys, mimetypes

ENDPOINT = os.environ.get("R2_ENDPOINT", "")
ACCESS_KEY = os.environ.get("R2_ACCESS_KEY", "")
SECRET_KEY = os.environ.get("R2_SECRET_KEY", "")
BUCKET = os.environ.get("R2_BUCKET", "web")
PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "")

if not all([ENDPOINT, ACCESS_KEY, SECRET_KEY, PUBLIC_URL]):
    print("Error: set R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, R2_PUBLIC_URL env vars")
    sys.exit(1)

s3 = boto3.client("s3",
    endpoint_url=ENDPOINT,
    aws_access_key_id=ACCESS_KEY,
    aws_secret_access_key=SECRET_KEY,
    region_name="auto",
)

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

images = [
    ("赞赏码.png", "images/赞赏码.png"),
    ("courses/dsp/images/butterfly_operation.png", "images/dsp/butterfly_operation.png"),
    ("courses/dsp/images/fft_4pt_compare.png", "images/dsp/fft_4pt_compare.png"),
    ("courses/dsp/images/fft_4pt_time.png", "images/dsp/fft_4pt_time.png"),
    ("courses/dsp/images/fft_8pt_freq_four2pt.png", "images/dsp/fft_8pt_freq_four2pt.png"),
    ("courses/dsp/images/fft_8pt_freq_full.png", "images/dsp/fft_8pt_freq_full.png"),
    ("courses/dsp/images/fft_8pt_freq_split.png", "images/dsp/fft_8pt_freq_split.png"),
    ("courses/dsp/images/fft_8pt_time_full.png", "images/dsp/fft_8pt_time_full.png"),
    ("courses/dsp/images/four_2pt_to_8pt.png", "images/dsp/four_2pt_to_8pt.png"),
]

print(f"Uploading {len(images)} images to R2 bucket '{BUCKET}'...\n")
for rel, key in images:
    local = os.path.join(SITE, rel)
    ctype = mimetypes.guess_type(rel)[0] or "image/png"
    s3.upload_file(local, BUCKET, key, ExtraArgs={"ContentType": ctype})
    url = f"{PUBLIC_URL}/{key}"
    print(f"  {rel}\n    -> {url}\n")

print("Done!")
