
import sys
import os

# Add c2_core to path
sys.path.append(os.getcwd())

from server.auth import verify_password, get_user, users_db

def test_login():
    username = "admin"
    password = "admin@123"
    
    print(f"Testing login for user: {username}")
    
    user = get_user(users_db, username)
    if not user:
        print("User not found!")
        return
        
    print(f"User found: {user.username}")
    print(f"Stored Hashed Password: {user.hashed_password}")
    
    is_valid = verify_password(password, user.hashed_password)
    
    if is_valid:
        print("SUCCESS: Password verified.")
    else:
        print("FAILURE: Password verification failed.")

if __name__ == "__main__":
    test_login()
