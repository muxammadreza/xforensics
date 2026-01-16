#!/usr/bin/env python3
"""
Database Integration Script for xforensics
Merges White Internet Database (Excel) and IR Influence Networks (JSON) into unified database.json
"""

import json
import pandas as pd
from datetime import datetime
import re
import sys
import os

# Paths
XFORENSICS_DB = "/Users/mo/projects/xforensics/database.json"
WHITE_INTERNET_XLSX = "/tmp/white_internet_database/white_internet.xlsx"
IR_NETWORK_JSON = "/tmp/ir_networks/Data/IR-Network.json"
MEK_JSON = "/tmp/ir_networks/Data/MEK.json"
OUTPUT_DB = "/Users/mo/projects/xforensics/database.json"

# Device type mapping from white_internet
DEVICE_MAP = {0: "Android", 1: "iPhone", 2: "Web"}

# Gender mapping from white_internet
GENDER_MAP = {0: 0, 1: 1, 2: 2}  # 0=male, 1=female, 2=unknown

def parse_twitter_date(date_str):
    """Parse Twitter's date format to timestamp"""
    if not date_str:
        return None
    try:
        # Format: "Wed Oct 02 10:33:10 +0000 2024"
        dt = datetime.strptime(date_str, "%a %b %d %H:%M:%S %z %Y")
        return int(dt.timestamp() * 1000)
    except:
        return None

def clean_username(username):
    """Clean username - remove @ and whitespace"""
    if not username:
        return None
    return str(username).strip().lstrip("@").lower()

def get_numeric_id(val):
    """Convert ID to string, handling scientific notation"""
    if pd.isna(val) or val is None:
        return None
    if isinstance(val, float):
        return str(int(val))
    return str(val)

def load_existing_db():
    """Load existing xforensics database"""
    print(f"Loading existing database from {XFORENSICS_DB}...")
    with open(XFORENSICS_DB, 'r', encoding='utf-8') as f:
        db = json.load(f)
    print(f"  Loaded {len(db)} existing entries")
    return db

def load_white_internet():
    """Load White Internet database from Excel"""
    print(f"\nLoading White Internet database from {WHITE_INTERNET_XLSX}...")
    df = pd.read_excel(WHITE_INTERNET_XLSX, header=None)
    
    entries = []
    for idx, row in df.iterrows():
        username = clean_username(row[0])
        if not username:
            continue
            
        numeric_id = get_numeric_id(row[9])
        
        entry = {
            "username": username,
            "displayName": str(row[1]) if pd.notna(row[1]) else None,
            "renamed": int(row[2]) if pd.notna(row[2]) else 0,
            "lastRenameDate": str(row[3]) if pd.notna(row[3]) else None,
            "created": str(row[4]) if pd.notna(row[4]) else None,
            "isDeleted": int(row[5]) == 0 if pd.notna(row[5]) else False,
            "deviceType": int(row[6]) if pd.notna(row[6]) else 2,
            "locationStatus": int(row[7]) if pd.notna(row[7]) else 0,
            "gender": int(row[8]) if pd.notna(row[8]) else 2,
            "id": numeric_id,
            "locationAccuracy": int(row[10]) if pd.notna(row[10]) else 1,
            "source": "white_internet"
        }
        
        # Map device type to string
        entry["device"] = DEVICE_MAP.get(entry["deviceType"], "Web")
        
        entries.append(entry)
    
    print(f"  Loaded {len(entries)} entries from White Internet")
    return entries

def load_ir_networks():
    """Load IR-Network and MEK JSON files"""
    entries = []
    
    for json_path, source_name in [(IR_NETWORK_JSON, "ir_network"), (MEK_JSON, "mek_network")]:
        print(f"\nLoading {source_name} from {json_path}...")
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        for item in data:
            username = clean_username(item.get("username"))
            if not username:
                continue
            
            created_raw = parse_twitter_date(item.get("creation_date"))
            
            entry = {
                "username": username,
                "displayName": item.get("name"),
                "id": str(item.get("user_id")) if item.get("user_id") else None,
                "created": item.get("creation_date"),
                "created_raw": created_raw,
                "followers": item.get("follower_count"),
                "following": item.get("following_count"),
                "tweetCount": item.get("number_of_tweets"),
                "isBlueVerified": item.get("is_blue_verified", False),
                "bio_location": item.get("location"),
                "bio": item.get("description"),
                "isBot": item.get("bot", False),
                "defaultProfile": item.get("default_profile", False),
                "listedCount": item.get("listed_count", 0),
                "source": source_name
            }
            entries.append(entry)
        
        print(f"  Loaded {len(data)} entries from {source_name}")
    
    return entries

def merge_entry(existing, new_data, source):
    """Merge new data into existing entry, preserving user notes/tags"""
    if existing is None:
        return None
    
    # Preserve user data
    preserved_note = existing.get("note", "")
    preserved_tags = existing.get("tags", [])
    preserved_html = existing.get("html")
    
    data = existing.get("data", {})
    
    # Add source tracking
    sources = data.get("sources", ["xforensics"])
    if source not in sources:
        sources.append(source)
    data["sources"] = sources
    
    # Merge new fields (only if not already set or new value is better)
    for key, value in new_data.items():
        if key in ["username", "source"]:
            continue
        if value is not None and (key not in data or data.get(key) is None):
            data[key] = value
    
    existing["data"] = data
    existing["note"] = preserved_note
    existing["tags"] = preserved_tags
    if preserved_html:
        existing["html"] = preserved_html
    
    return existing

def create_new_entry(data, source):
    """Create a new database entry from external source data"""
    username = data.get("username")
    
    # Determine color based on source
    if source == "white_internet":
        color = "var(--xf-orange)"  # White internet = Iran-based, caution
        risk_label = "احتیاط"
    elif source in ["ir_network", "mek_network"]:
        color = "var(--xf-red)"  # Influence network = detected
        risk_label = "هشدار"
    else:
        color = "var(--xf-green)"
        risk_label = "طبیعی"
    
    device = data.get("device", "Web")
    country = "Iran" if source == "white_internet" else "Unknown"
    
    entry = {
        "data": {
            "id": data.get("id"),
            "displayName": data.get("displayName"),
            "country": country,
            "countryCode": country,
            "device": device,
            "deviceFull": device,
            "deviceType": data.get("deviceType", 2),
            "created": data.get("created"),
            "created_raw": data.get("created_raw"),
            "renamed": data.get("renamed", 0),
            "lastRenameDate": data.get("lastRenameDate"),
            "isDeleted": data.get("isDeleted", False),
            "isAccurate": False,
            "isIdVerified": False,
            "langCode": "fa",  # Assume Farsi for these sources
            "avatar": None,
            "riskLabel": risk_label,
            "locationStatus": data.get("locationStatus", 0),
            "locationAccuracy": data.get("locationAccuracy", 1),
            "gender": data.get("gender", 2),
            "followers": data.get("followers"),
            "following": data.get("following"),
            "tweetCount": data.get("tweetCount"),
            "isBlueVerified": data.get("isBlueVerified", False),
            "bio_location": data.get("bio_location"),
            "bio": data.get("bio"),
            "isBot": data.get("isBot", False),
            "defaultProfile": data.get("defaultProfile", False),
            "listedCount": data.get("listedCount", 0),
            "sources": [source]
        },
        "pillText": f"📍 {country} | 📱 {device}",
        "color": color,
        "note": "",
        "tags": [source]  # Auto-tag with source
    }
    
    return entry

def build_id_index(db):
    """Build an index of user_id -> username for fast lookup"""
    id_index = {}
    for username, entry in db.items():
        data = entry.get("data", {})
        user_id = data.get("id")
        if user_id:
            id_index[str(user_id)] = username
    return id_index

def main():
    print("=" * 60)
    print("xforensics Database Integration Script")
    print("=" * 60)
    
    # Load existing database
    db = load_existing_db()
    
    # Build ID index for deduplication
    id_index = build_id_index(db)
    print(f"\nBuilt ID index with {len(id_index)} entries")
    
    # Statistics
    stats = {
        "existing": len(db),
        "white_internet_new": 0,
        "white_internet_merged": 0,
        "ir_network_new": 0,
        "ir_network_merged": 0,
        "mek_network_new": 0,
        "mek_network_merged": 0,
    }
    
    # Process White Internet database
    white_entries = load_white_internet()
    for entry in white_entries:
        username = entry["username"]
        user_id = entry.get("id")
        source = entry["source"]
        
        # Check if exists by ID first (most reliable)
        existing_username = id_index.get(user_id) if user_id else None
        
        if existing_username and existing_username in db:
            # Merge into existing entry
            db[existing_username] = merge_entry(db[existing_username], entry, source)
            stats[f"{source}_merged"] += 1
        elif username in db:
            # Username match
            db[username] = merge_entry(db[username], entry, source)
            stats[f"{source}_merged"] += 1
        else:
            # New entry
            db[username] = create_new_entry(entry, source)
            if user_id:
                id_index[user_id] = username
            stats[f"{source}_new"] += 1
    
    # Process IR Networks
    ir_entries = load_ir_networks()
    for entry in ir_entries:
        username = entry["username"]
        user_id = entry.get("id")
        source = entry["source"]
        
        existing_username = id_index.get(user_id) if user_id else None
        
        if existing_username and existing_username in db:
            db[existing_username] = merge_entry(db[existing_username], entry, source)
            stats[f"{source}_merged"] += 1
        elif username in db:
            db[username] = merge_entry(db[username], entry, source)
            stats[f"{source}_merged"] += 1
        else:
            db[username] = create_new_entry(entry, source)
            if user_id:
                id_index[user_id] = username
            stats[f"{source}_new"] += 1
    
    # Add 'xforensics' source to entries that don't have sources field
    for username, entry in db.items():
        data = entry.get("data", {})
        if "sources" not in data:
            data["sources"] = ["xforensics"]
            entry["data"] = data
    
    # Save merged database
    print(f"\nSaving merged database to {OUTPUT_DB}...")
    with open(OUTPUT_DB, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    
    # Print statistics
    print("\n" + "=" * 60)
    print("Integration Statistics")
    print("=" * 60)
    print(f"Original entries:        {stats['existing']:,}")
    print(f"White Internet new:      {stats['white_internet_new']:,}")
    print(f"White Internet merged:   {stats['white_internet_merged']:,}")
    print(f"IR-Network new:          {stats['ir_network_new']:,}")
    print(f"IR-Network merged:       {stats['ir_network_merged']:,}")
    print(f"MEK Network new:         {stats['mek_network_new']:,}")
    print(f"MEK Network merged:      {stats['mek_network_merged']:,}")
    print("-" * 60)
    print(f"Final total entries:     {len(db):,}")
    print("=" * 60)
    print("\n✅ Database integration complete!")

if __name__ == "__main__":
    main()
