import os
import time
import shutil

# Sandbox directory path
SANDBOX_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "sandbox"))

def setup_sandbox():
    print(f"[RANSOMWARE-TEST] Setting up sandbox folder at: {SANDBOX_DIR}")
    if os.path.exists(SANDBOX_DIR):
        print("[RANSOMWARE-TEST] Cleaning up previous sandbox files...")
        shutil.rmtree(SANDBOX_DIR)
    os.makedirs(SANDBOX_DIR, exist_ok=True)

def generate_dummy_files():
    print("[RANSOMWARE-TEST] Rapidly writing 40 lock files to simulate Ransomware...")
    start_time = time.time()
    
    # 40 files in ~1.2 seconds (~0.03s sleep per file to complete under 1.5 seconds)
    for i in range(1, 41):
        filename = f"compromised_data_{i}.lock"
        filepath = os.path.join(SANDBOX_DIR, filename)
        with open(filepath, "w") as f:
            f.write("BENIGN: Dummy file content for simulated Ransomware EDR testing.")
        time.sleep(1.2 / 40)
        
    duration = time.time() - start_time
    print(f"[RANSOMWARE-TEST] Generated 40 files in {duration:.2f} seconds.")

def teardown_sandbox():
    print("[RANSOMWARE-TEST] Sleeping 5.0 seconds to allow EDR detection and SOAR processing...")
    time.sleep(5.0)
    print(f"[RANSOMWARE-TEST] Starting Teardown: Cleaning up sandbox directory: {SANDBOX_DIR}")
    if os.path.exists(SANDBOX_DIR):
        try:
            shutil.rmtree(SANDBOX_DIR)
            print("[RANSOMWARE-TEST] Teardown complete. Sandbox folder cleaned successfully.")
        except Exception as e:
            print(f"[RANSOMWARE-TEST] Warning during teardown: {e}")

def main():
    setup_sandbox()
    # Sleep briefly to ensure FIM starts tracking the folder
    time.sleep(0.5)
    generate_dummy_files()
    teardown_sandbox()

if __name__ == "__main__":
    main()
