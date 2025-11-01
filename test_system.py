#!/usr/bin/env python3
"""
Test script to verify all fixes in the 360° Product Capture System
"""

import requests
import json
import time
import sys
from pathlib import Path

BASE_URL = "http://localhost:5000"

def test_connection():
    """Test if server is running"""
    print("Testing server connection...")
    try:
        response = requests.get(f"{BASE_URL}/api/status", timeout=5)
        if response.status_code == 200:
            print("✅ Server is running")
            return True
        else:
            print("❌ Server returned error")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to server. Is it running?")
        print("   Run: python3 lightweight_capture_app_fixed.py")
        return False
    except Exception as e:
        print(f"❌ Connection error: {e}")
        return False

def test_camera_scan():
    """Test camera scanning"""
    print("\nTesting camera scan...")
    try:
        response = requests.get(f"{BASE_URL}/api/camera/scan")
        data = response.json()

        if data['success']:
            print(f"✅ Found {len(data['cameras'])} camera(s)")
            for cam in data['cameras']:
                print(f"   - {cam['name']}")
            return True
        else:
            print("❌ Camera scan failed")
            return False
    except Exception as e:
        print(f"❌ Camera scan error: {e}")
        return False

def test_storage_detection():
    """Test storage device detection"""
    print("\nTesting storage detection...")
    try:
        response = requests.get(f"{BASE_URL}/api/storage")
        devices = response.json()

        if devices:
            print(f"✅ Found {len(devices)} storage device(s)")
            for device in devices[:3]:  # Show first 3
                print(f"   - {device['device']}: {device['free_gb']} GB free")
            return True
        else:
            print("❌ No storage devices found")
            return False
    except Exception as e:
        print(f"❌ Storage detection error: {e}")
        return False

def test_storage_selection():
    """Test storage selection"""
    print("\nTesting storage selection...")
    try:
        # Get home directory as test storage
        home_path = str(Path.home())

        response = requests.post(
            f"{BASE_URL}/api/storage/select",
            headers={'Content-Type': 'application/json'},
            json={'mountpoint': home_path}
        )

        data = response.json()
        if data['success']:
            print(f"✅ Storage set to: {data['path']}")
            return True
        else:
            print("❌ Storage selection failed")
            return False
    except Exception as e:
        print(f"❌ Storage selection error: {e}")
        return False

def test_camera_init():
    """Test camera initialization"""
    print("\nTesting camera initialization...")
    try:
        response = requests.post(
            f"{BASE_URL}/api/camera/init",
            headers={'Content-Type': 'application/json'},
            json={'camera_index': 0}
        )

        data = response.json()
        if data['success']:
            print("✅ Camera initialized successfully")
            return True
        else:
            print("❌ Camera initialization failed")
            return False
    except Exception as e:
        print(f"❌ Camera init error: {e}")
        return False

def test_capture():
    """Test image capture"""
    print("\nTesting image capture...")
    try:
        response = requests.post(f"{BASE_URL}/api/capture")
        data = response.json()

        if data['success']:
            print(f"✅ Image captured: {data['message']}")
            return True
        else:
            print(f"❌ Capture failed: {data['message']}")
            return False
    except Exception as e:
        print(f"❌ Capture error: {e}")
        return False

def test_session():
    """Test automated capture session"""
    print("\nTesting automated session...")
    try:
        # Start session
        print("Starting session (5 seconds, 12 captures/minute)...")
        response = requests.post(
            f"{BASE_URL}/api/session/start",
            headers={'Content-Type': 'application/json'},
            json={'rate': 12, 'duration': 0.083}  # 5 seconds
        )

        data = response.json()
        if not data['success']:
            print("❌ Failed to start session")
            return False

        print("✅ Session started")

        # Monitor session for 6 seconds
        for i in range(6):
            time.sleep(1)
            response = requests.get(f"{BASE_URL}/api/session/status")
            status = response.json()

            print(f"   Status: {'Active' if status['active'] else 'Inactive'}, "
                  f"Captures: {status['captures']}, "
                  f"Elapsed: {status['elapsed']}s")

            if not status['active'] and i >= 5:
                print("✅ Session auto-stopped as expected")
                return True

        # Stop session if still running
        requests.post(f"{BASE_URL}/api/session/stop")
        print("✅ Session test completed")
        return True

    except Exception as e:
        print(f"❌ Session test error: {e}")
        return False

def test_folder_operations():
    """Test folder creation and browsing"""
    print("\nTesting folder operations...")
    try:
        # Get current folder
        response = requests.get(f"{BASE_URL}/api/folder")
        data = response.json()
        current_path = data['path']
        print(f"Current folder: {current_path}")

        # Create test folder
        test_folder_name = f"test_folder_{int(time.time())}"
        response = requests.post(
            f"{BASE_URL}/api/folder/create",
            headers={'Content-Type': 'application/json'},
            json={'path': current_path, 'name': test_folder_name}
        )

        data = response.json()
        if data['success']:
            print(f"✅ Created folder: {test_folder_name}")

            # Verify folder appears in listing
            response = requests.get(f"{BASE_URL}/api/folder?path={current_path}")
            data = response.json()

            folder_found = any(
                item['name'] == test_folder_name
                for item in data.get('contents', [])
            )

            if folder_found:
                print("✅ Folder appears in directory listing")
                return True
            else:
                print("❌ Folder not found in listing")
                return False
        else:
            print("❌ Failed to create folder")
            return False

    except Exception as e:
        print(f"❌ Folder operations error: {e}")
        return False

def run_all_tests():
    """Run all tests"""
    print("=" * 60)
    print("360° PRODUCT CAPTURE SYSTEM - TEST SUITE")
    print("=" * 60)

    tests = [
        ("Server Connection", test_connection),
        ("Camera Scan", test_camera_scan),
        ("Storage Detection", test_storage_detection),
        ("Storage Selection", test_storage_selection),
        ("Camera Init", test_camera_init),
        ("Image Capture", test_capture),
        ("Folder Operations", test_folder_operations),
        ("Automated Session", test_session),
    ]

    results = {}

    for test_name, test_func in tests:
        print(f"\n{'='*40}")
        print(f"Running: {test_name}")
        print('='*40)

        try:
            passed = test_func()
            results[test_name] = passed
        except Exception as e:
            print(f"❌ Test crashed: {e}")
            results[test_name] = False

        time.sleep(0.5)  # Brief pause between tests

    # Print summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)

    total = len(results)
    passed = sum(1 for v in results.values() if v)

    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name:.<30} {status}")

    print("-" * 60)
    print(f"Results: {passed}/{total} tests passed")

    if passed == total:
        print("\n🎉 ALL TESTS PASSED! The system is working correctly.")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Check the errors above.")

    return passed == total

if __name__ == "__main__":
    print("\n⚠️  Make sure the server is running before running tests!")
    print("   In another terminal: python3 lightweight_capture_app_fixed.py\n")

    input("Press Enter when server is running...")

    success = run_all_tests()

    sys.exit(0 if success else 1)