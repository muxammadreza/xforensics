#!/usr/bin/env python3
"""
Verification script for xforensics database integration.
Run this to verify data integrity after merging external databases.
"""

import json
import sys

def main():
    print("=" * 60)
    print("xforensics Database Verification")
    print("=" * 60)
    
    try:
        with open('database.json', 'r', encoding='utf-8') as f:
            db = json.load(f)
    except Exception as e:
        print(f"❌ Failed to load database: {e}")
        sys.exit(1)
    
    total = len(db)
    print(f"✅ Loaded {total:,} entries")
    
    # Required fields check
    required_fields = ['country', 'device', 'created', 'riskLabel', 'sources']
    missing_required = 0
    
    for username, entry in db.items():
        data = entry.get('data', {})
        for field in required_fields:
            if field not in data:
                missing_required += 1
                break
    
    if missing_required == 0:
        print(f"✅ All entries have required fields")
    else:
        print(f"⚠️ {missing_required} entries missing required fields")
    
    # Source distribution
    source_counts = {}
    for entry in db.values():
        for s in entry.get('data', {}).get('sources', []):
            source_counts[s] = source_counts.get(s, 0) + 1
    
    print("\n📊 Source Distribution:")
    for src, count in sorted(source_counts.items(), key=lambda x: -x[1]):
        pct = (count / total) * 100
        print(f"   {src}: {count:,} ({pct:.1f}%)")
    
    # Verify no data corruption
    corrupted = 0
    for username, entry in db.items():
        if not isinstance(entry, dict):
            corrupted += 1
        elif 'data' not in entry:
            corrupted += 1
        elif not isinstance(entry['data'], dict):
            corrupted += 1
    
    if corrupted == 0:
        print(f"\n✅ No data corruption detected")
    else:
        print(f"\n❌ {corrupted} corrupted entries found!")
    
    # Check for entries with ID
    with_id = sum(1 for e in db.values() if e.get('data', {}).get('id'))
    print(f"✅ {with_id:,} entries have permanent X ID ({with_id/total*100:.1f}%)")
    
    print("\n" + "=" * 60)
    print("✅ Verification Complete")
    print("=" * 60)

if __name__ == "__main__":
    main()
