import os
import sys
import time
import zipfile
import shutil
import subprocess

def log(message):
    print(f"[Updater] {message}")

def main():
    log("Starting update process...")
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
        extracted_content = os.path.join(temp_extract_dir, os.listdir(temp_extract_dir)[0])
        if not os.path.isdir(extracted_content):
            raise IndexError("No directory found in the extracted content.")
        log(f"Found extracted content in: {extracted_content}")
    except IndexError as e:
        log(f"Error finding extracted content: {e}")
        shutil.rmtree(temp_extract_dir)
        os.remove(update_zip)
        return

    log("Copying updated files...")
    current_dir = os.getcwd()
    for item in os.listdir(extracted_content):
        source_path = os.path.join(extracted_content, item)
        dest_path = os.path.join(current_dir, item)
        try:
            if os.path.isdir(source_path):
                shutil.rmtree(dest_path, ignore_errors=True)
                shutil.copytree(source_path, dest_path)
            else:
                shutil.copy2(source_path, dest_path)
        except Exception as e:
            log(f"Could not copy {item}: {e}")
    log("File copy complete.")

    log("Cleaning up temporary files...")
    try:
        shutil.rmtree(temp_extract_dir)
        os.remove(update_zip)
        log("Cleanup complete.")
    except OSError as e:
        log(f"Error during cleanup: {e}")

    log("Checking for new dependencies...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "--upgrade"])
        log("Dependencies are up to date.")
    except subprocess.CalledProcessError as e:
        log(f"Error updating dependencies: {e}")
        log("Please run 'pip install -r requirements.txt' manually.")

    log("Relaunching Snap Solver...")
    subprocess.Popen([sys.executable, "app.py"])
    log("Update process finished. Exiting updater.")

if __name__ == "__main__":
    main()