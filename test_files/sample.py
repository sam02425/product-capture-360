#!/usr/bin/env python3
"""
Sample Python file for testing file browser preview functionality
"""

import os
import sys
from datetime import datetime

class SampleClass:
    """A sample class to demonstrate Python syntax highlighting"""
    
    def __init__(self, name):
        self.name = name
        self.created_at = datetime.now()
    
    def greet(self):
        """Return a greeting message"""
        return f"Hello from {self.name}!"
    
    def get_info(self):
        """Return object information"""
        return {
            'name': self.name,
            'created_at': self.created_at.isoformat(),
            'type': 'SampleClass'
        }

def main():
    """Main function demonstrating various Python features"""
    # Create an instance
    sample = SampleClass("File Browser Test")
    
    # Print greeting
    print(sample.greet())
    
    # List comprehension example
    numbers = [i**2 for i in range(10) if i % 2 == 0]
    print(f"Even squares: {numbers}")
    
    # Dictionary example
    config = {
        'debug': True,
        'max_items': 100,
        'supported_formats': ['txt', 'py', 'js', 'html', 'css']
    }
    
    # Exception handling
    try:
        result = 10 / 2
        print(f"Division result: {result}")
    except ZeroDivisionError as e:
        print(f"Error: {e}")
    
    return sample.get_info()

if __name__ == "__main__":
    info = main()
    print(f"Sample info: {info}")