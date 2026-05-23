# backend/migrate_db.py
import json
import os
import sys
from db import init_db, sync_data_to_db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "backend_db.json")

def migrate():
    print("🚀 Starting migration from JSON mock to PostgreSQL database...")
    
    # 1. Initialize tables if they do not exist
    try:
        init_db()
    except Exception as e:
        print(f"❌ Failed to initialize database: {e}")
        print("Please check if PostgreSQL is running and credentials in backend/db.py are correct.")
        sys.exit(1)
        
    # 2. Check if backend_db.json exists
    if not os.path.exists(DB_FILE):
        print(f"⚠️ Mock data file {DB_FILE} not found. Nothing to migrate.")
        return
        
    # 3. Load the JSON data
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ Failed to read {DB_FILE}: {e}")
        sys.exit(1)
        
    # 4. Sync the data to PostgreSQL
    try:
        sync_data_to_db(data)
        print("✅ Migration completed successfully! All data has been copied to PostgreSQL.")
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    migrate()
