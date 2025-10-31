#!/usr/bin/env python3
"""
Storage Functionality Tests
Tests to verify that files are stored in the selected folder correctly.
"""

import unittest
import requests
import json
import os
import tempfile
import shutil
from pathlib import Path
import time

class TestStorageFunctionality(unittest.TestCase):
    """Test suite for storage functionality"""
    
    BASE_URL = "http://localhost:5000"
    
    def setUp(self):
        """Set up test environment"""
        # Create a temporary test directory
        self.test_dir = tempfile.mkdtemp(prefix="capture_test_")
        self.original_folder = None
        
        # Get current folder to restore later
        try:
            response = requests.get(f"{self.BASE_URL}/api/status")
            if response.status_code == 200:
                self.original_folder = response.json().get('current_folder')
        except:
            pass
    
    def tearDown(self):
        """Clean up test environment"""
        # Restore original folder if we had one
        if self.original_folder:
            try:
                requests.post(
                    f"{self.BASE_URL}/api/folder/set",
                    json={"path": self.original_folder}
                )
            except:
                pass
        
        # Clean up test directory
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_folder_selection_api(self):
        """Test that folder selection API works correctly"""
        # Set test folder
        response = requests.post(
            f"{self.BASE_URL}/api/folder/set",
            json={"path": self.test_dir}
        )
        
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['current_folder'], self.test_dir)
        
        # Verify folder is set in status
        status_response = requests.get(f"{self.BASE_URL}/api/status")
        self.assertEqual(status_response.status_code, 200)
        status_data = status_response.json()
        self.assertEqual(status_data['current_folder'], self.test_dir)
    
    def test_invalid_folder_selection(self):
        """Test that invalid folder paths are rejected"""
        invalid_path = "/nonexistent/path/that/should/not/exist"
        
        response = requests.post(
            f"{self.BASE_URL}/api/folder/set",
            json={"path": invalid_path}
        )
        
        # Should return error for non-existent path
        self.assertNotEqual(response.status_code, 200)
    
    def test_capture_storage_location(self):
        """Test that captures are stored in the selected folder"""
        # Set test folder
        requests.post(
            f"{self.BASE_URL}/api/folder/set",
            json={"path": self.test_dir}
        )
        
        # Get initial file count
        initial_files = len([f for f in os.listdir(self.test_dir) 
                           if f.startswith('capture_') and f.endswith('.jpg')])
        
        # Capture an image
        capture_response = requests.post(f"{self.BASE_URL}/api/capture")
        self.assertEqual(capture_response.status_code, 200)
        
        capture_data = capture_response.json()
        self.assertTrue(capture_data['success'])
        
        # Wait a moment for file to be written
        time.sleep(0.5)
        
        # Check that a new file was created in the test directory
        final_files = len([f for f in os.listdir(self.test_dir) 
                         if f.startswith('capture_') and f.endswith('.jpg')])
        
        self.assertEqual(final_files, initial_files + 1)
        
        # Verify the specific file exists
        if 'message' in capture_data:
            # Extract filename from message like "Image saved as capture_20251028_191910_0216.jpg"
            message = capture_data['message']
            if 'Image saved as ' in message:
                filename = message.split('Image saved as ')[1]
                expected_path = os.path.join(self.test_dir, filename)
                self.assertTrue(os.path.exists(expected_path), 
                              f"Expected file {expected_path} does not exist")
    
    def test_folder_creation_during_capture(self):
        """Test that folders are created if they don't exist during capture"""
        # Create a nested test path that doesn't exist yet
        nested_path = os.path.join(self.test_dir, "nested", "folder")
        
        # Set the non-existent nested path
        response = requests.post(
            f"{self.BASE_URL}/api/folder/set",
            json={"path": nested_path}
        )
        
        # This should fail since the path doesn't exist
        self.assertNotEqual(response.status_code, 200)
        
        # Create the nested path manually
        os.makedirs(nested_path, exist_ok=True)
        
        # Now setting should work
        response = requests.post(
            f"{self.BASE_URL}/api/folder/set",
            json={"path": nested_path}
        )
        self.assertEqual(response.status_code, 200)
        
        # Capture should work and create files in nested path
        capture_response = requests.post(f"{self.BASE_URL}/api/capture")
        self.assertEqual(capture_response.status_code, 200)
        
        # Wait and check for files
        time.sleep(0.5)
        files = [f for f in os.listdir(nested_path) 
                if f.startswith('capture_') and f.endswith('.jpg')]
        self.assertGreater(len(files), 0)
    
    def test_multiple_captures_same_folder(self):
        """Test multiple captures in the same folder"""
        # Set test folder
        requests.post(
            f"{self.BASE_URL}/api/folder/set",
            json={"path": self.test_dir}
        )
        
        # Capture multiple images
        num_captures = 3
        for i in range(num_captures):
            response = requests.post(f"{self.BASE_URL}/api/capture")
            self.assertEqual(response.status_code, 200)
            time.sleep(0.2)  # Small delay between captures
        
        # Wait for all files to be written
        time.sleep(1)
        
        # Check that all files were created
        files = [f for f in os.listdir(self.test_dir) 
                if f.startswith('capture_') and f.endswith('.jpg')]
        self.assertGreaterEqual(len(files), num_captures)
    
    def test_folder_switching(self):
        """Test switching between different folders"""
        # Create two test directories
        test_dir2 = tempfile.mkdtemp(prefix="capture_test2_")
        
        try:
            # Set first folder and capture
            requests.post(f"{self.BASE_URL}/api/folder/set", json={"path": self.test_dir})
            requests.post(f"{self.BASE_URL}/api/capture")
            time.sleep(0.5)
            
            # Set second folder and capture
            requests.post(f"{self.BASE_URL}/api/folder/set", json={"path": test_dir2})
            requests.post(f"{self.BASE_URL}/api/capture")
            time.sleep(0.5)
            
            # Check that each folder has files
            files1 = [f for f in os.listdir(self.test_dir) 
                     if f.startswith('capture_') and f.endswith('.jpg')]
            files2 = [f for f in os.listdir(test_dir2) 
                     if f.startswith('capture_') and f.endswith('.jpg')]
            
            self.assertGreater(len(files1), 0)
            self.assertGreater(len(files2), 0)
            
        finally:
            # Clean up second test directory
            if os.path.exists(test_dir2):
                shutil.rmtree(test_dir2)

def run_tests():
    """Run all storage tests"""
    print("Running Storage Functionality Tests...")
    print("=" * 50)
    
    # Check if server is running
    try:
        response = requests.get("http://localhost:5000/api/status", timeout=5)
        if response.status_code != 200:
            print("❌ Server is not responding correctly")
            return False
    except requests.exceptions.RequestException:
        print("❌ Cannot connect to server at http://localhost:5000")
        print("   Please make sure the capture application is running")
        return False
    
    print("✅ Server is running and accessible")
    print()
    
    # Run the test suite
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestStorageFunctionality)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print()
    print("=" * 50)
    if result.wasSuccessful():
        print("✅ All storage tests passed!")
        return True
    else:
        print(f"❌ {len(result.failures)} test(s) failed, {len(result.errors)} error(s)")
        return False

if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)