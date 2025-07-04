import os
import sys
import time
import zipfile
import shutil
import subprocess
import hashlib

def log(message):
    print(f"[Updater] {message}")

def get_file_hash(filepath):
    if not os.path.exists(filepath):
        return None
    
    sha256_hash = hashlib.sha256()
    with open(filepath, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def main():
    log("Starting safe update process...")
    time.sleep(2)

    update_zip = 'update.zip'
    if not os.path.exists(update_zip):
        log("Error: update.zip not found. Aborting.")
        return

    temp_extract_dir = 'update_temp'
    log(f"Extracting {update_zip} to {temp_extract_dir}...")
    try:
        with zipfile.ZipFile(update_zip, 'r') as zip_ref:
            zip_ref.extractall(temp_extract_dir)
        log("Extraction complete.")
    except Exception as e:
        log(f"Error extracting zip file: {e}")
        return

    try:
        extracted_content_dir = os.path.join(temp_extract_dir, os.listdir(temp_extract_dir)[0])
        if not os.path.isdir(extracted_content_dir):
            raise IndexError("No directory found in the extracted content.")
        log(f"Found extracted content in: {extracted_content_dir}")
    except IndexError as e:
        log(f"Error finding extracted content: {e}")
        shutil.rmtree(temp_extract_dir)
        os.remove(update_zip)
        return

    log("Applying update (copying new/modified files)...")
    current_dir = os.getcwd()
    
    for root, dirs, files in os.walk(extracted_content_dir):
        relative_path = os.path.relpath(root, extracted_content_dir)
        dest_dir = os.path.join(current_dir, relative_path)
        os.makedirs(dest_dir, exist_ok=True)

        for file in files:
            source_file_path = os.path.join(root, file)
            dest_file_path = os.path.join(dest_dir, file)
            
            source_hash = get_file_hash(source_file_path)
            dest_hash = get_file_hash(dest_file_path)

            if source_hash != dest_hash:
                log(f"  - Updating: {relative_path}/{file}")
                shutil.copy2(source_file_path, dest_file_path)
            else:
                log(f"  - Skipping (unchanged): {relative_path}/{file}")

    log("File update process complete.")

    log("Cleaning up temporary files...")
    try:
        shutil.rmtree(temp_extract_dir)
        os.remove(update_zip)
        log("Cleanup complete.")
    except OSError as e:
        log(f"Error during cleanup: {e}")

    log("Checking for new dependencies...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "--upgrade", "--no-cache-dir"])
        log("Dependencies are up to date.")
    except subprocess.CalledProcessError as e:
        log(f"Error updating dependencies: {e}")
        log("Please run 'pip install -r requirements.txt' manually.")

    log("Relaunching Snap Solver...")
    subprocess.Popen([sys.executable, "app.py"])
    log("Update process finished. Exiting updater.")

if __name__ == "__main__":
    main()