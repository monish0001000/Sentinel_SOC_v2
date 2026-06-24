import subprocess
import sys

def main():
    print("Upgrading numpy to a safe, compatible version...")
    try:
        # Upgrade numpy to version >= 1.25.2, < 2.0.0
        subprocess.check_call([sys.executable, "-m", "pip", "install", "numpy>=1.25.2,<2.0.0", "--upgrade"])
        
        # Verify installation
        import numpy
        print(f"NumPy version installed: {numpy.__version__}")
        
        import scipy
        print(f"SciPy version installed: {scipy.__version__}")
        
        import sklearn
        print(f"scikit-learn version installed: {sklearn.__version__}")
        
        print("Dependencies successfully upgraded and verified.")
    except Exception as e:
        print(f"An error occurred: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
