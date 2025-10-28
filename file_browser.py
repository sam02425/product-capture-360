#!/usr/bin/env python3
"""
File Browser Application with Live Preview
A comprehensive file management system with real-time preview capabilities
"""

import streamlit as st
import os
import pathlib
import mimetypes
import base64
import json
import time
from datetime import datetime
from PIL import Image
import pandas as pd

# Configure Streamlit page
st.set_page_config(
    page_title="File Browser with Live Preview",
    page_icon="📁",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Initialize session state
if 'current_path' not in st.session_state:
    st.session_state.current_path = str(pathlib.Path.home())
if 'selected_file' not in st.session_state:
    st.session_state.selected_file = None
if 'preview_enabled' not in st.session_state:
    st.session_state.preview_enabled = True
if 'auto_refresh' not in st.session_state:
    st.session_state.auto_refresh = False
if 'last_refresh' not in st.session_state:
    st.session_state.last_refresh = time.time()

class FileBrowser:
    """Main file browser class with navigation and preview capabilities"""
    
    def __init__(self):
        self.supported_image_types = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'}
        self.supported_text_types = {'.txt', '.py', '.js', '.html', '.css', '.json', '.xml', '.md', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf'}
        self.supported_data_types = {'.csv', '.xlsx', '.xls', '.json'}
        
    def get_file_info(self, file_path):
        """Get comprehensive file information"""
        try:
            path = pathlib.Path(file_path)
            stat = path.stat()
            
            return {
                'name': path.name,
                'size': stat.st_size,
                'modified': datetime.fromtimestamp(stat.st_mtime),
                'is_dir': path.is_dir(),
                'extension': path.suffix.lower(),
                'mime_type': mimetypes.guess_type(str(path))[0] or 'unknown',
                'permissions': oct(stat.st_mode)[-3:]
            }
        except Exception as e:
            return {'error': str(e)}
    
    def format_file_size(self, size_bytes):
        """Format file size in human readable format"""
        if size_bytes == 0:
            return "0 B"
        
        size_names = ["B", "KB", "MB", "GB", "TB"]
        i = 0
        while size_bytes >= 1024 and i < len(size_names) - 1:
            size_bytes /= 1024.0
            i += 1
        
        return f"{size_bytes:.1f} {size_names[i]}"
    
    def get_directory_contents(self, path):
        """Get sorted directory contents with error handling"""
        try:
            path_obj = pathlib.Path(path)
            if not path_obj.exists():
                return [], f"Path does not exist: {path}"
            
            if not path_obj.is_dir():
                return [], f"Not a directory: {path}"
            
            contents = []
            for item in path_obj.iterdir():
                try:
                    info = self.get_file_info(item)
                    if 'error' not in info:
                        contents.append({
                            'path': str(item),
                            'info': info
                        })
                except PermissionError:
                    continue
                except Exception as e:
                    continue
            
            # Sort: directories first, then files, both alphabetically
            contents.sort(key=lambda x: (not x['info']['is_dir'], x['info']['name'].lower()))
            return contents, None
            
        except PermissionError:
            return [], f"Permission denied: {path}"
        except Exception as e:
            return [], f"Error reading directory: {str(e)}"
    
    def create_folder(self, parent_path, folder_name):
        """Create a new folder with error handling"""
        try:
            if not folder_name or folder_name.strip() == "":
                return False, "Folder name cannot be empty"
            
            # Sanitize folder name
            folder_name = folder_name.strip()
            invalid_chars = '<>:"/\\|?*'
            if any(char in folder_name for char in invalid_chars):
                return False, f"Folder name contains invalid characters: {invalid_chars}"
            
            new_path = pathlib.Path(parent_path) / folder_name
            
            if new_path.exists():
                return False, f"Folder '{folder_name}' already exists"
            
            new_path.mkdir(parents=True, exist_ok=False)
            return True, f"Folder '{folder_name}' created successfully"
            
        except PermissionError:
            return False, f"Permission denied: Cannot create folder in {parent_path}"
        except Exception as e:
            return False, f"Error creating folder: {str(e)}"
    
    def preview_image(self, file_path):
        """Preview image files with error handling"""
        try:
            image = Image.open(file_path)
            st.image(image, caption=f"Image: {pathlib.Path(file_path).name}", use_column_width=True)
            
            # Display image metadata
            st.write("**Image Information:**")
            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric("Format", image.format or "Unknown")
            with col2:
                st.metric("Size", f"{image.size[0]} × {image.size[1]}")
            with col3:
                st.metric("Mode", image.mode)
                
        except Exception as e:
            st.error(f"Error loading image: {str(e)}")
    
    def preview_text(self, file_path, max_lines=100):
        """Preview text files with syntax highlighting"""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # Limit content for performance
            lines = content.split('\n')
            if len(lines) > max_lines:
                content = '\n'.join(lines[:max_lines])
                st.warning(f"Showing first {max_lines} lines of {len(lines)} total lines")
            
            # Determine language for syntax highlighting
            extension = pathlib.Path(file_path).suffix.lower()
            language_map = {
                '.py': 'python',
                '.js': 'javascript',
                '.html': 'html',
                '.css': 'css',
                '.json': 'json',
                '.xml': 'xml',
                '.md': 'markdown',
                '.yml': 'yaml',
                '.yaml': 'yaml'
            }
            
            language = language_map.get(extension, 'text')
            st.code(content, language=language)
            
        except Exception as e:
            st.error(f"Error reading file: {str(e)}")
    
    def preview_data(self, file_path):
        """Preview data files (CSV, Excel, JSON)"""
        try:
            extension = pathlib.Path(file_path).suffix.lower()
            
            if extension == '.csv':
                df = pd.read_csv(file_path)
                st.dataframe(df, use_container_width=True)
                st.write(f"**Shape:** {df.shape[0]} rows × {df.shape[1]} columns")
                
            elif extension in ['.xlsx', '.xls']:
                df = pd.read_excel(file_path)
                st.dataframe(df, use_container_width=True)
                st.write(f"**Shape:** {df.shape[0]} rows × {df.shape[1]} columns")
                
            elif extension == '.json':
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                st.json(data)
                
        except Exception as e:
            st.error(f"Error loading data file: {str(e)}")
    
    def preview_file(self, file_path):
        """Main file preview function"""
        if not file_path or not pathlib.Path(file_path).exists():
            st.info("Select a file to preview")
            return
        
        file_info = self.get_file_info(file_path)
        if 'error' in file_info:
            st.error(f"Error accessing file: {file_info['error']}")
            return
        
        if file_info['is_dir']:
            st.info("📁 Directory selected - navigate to browse contents")
            return
        
        # Display file information
        st.subheader(f"📄 {file_info['name']}")
        
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("Size", self.format_file_size(file_info['size']))
        with col2:
            st.metric("Type", file_info['mime_type'])
        with col3:
            st.metric("Modified", file_info['modified'].strftime("%Y-%m-%d %H:%M"))
        with col4:
            st.metric("Permissions", file_info['permissions'])
        
        st.divider()
        
        # Preview based on file type
        extension = file_info['extension']
        
        if extension in self.supported_image_types:
            self.preview_image(file_path)
        elif extension in self.supported_text_types:
            self.preview_text(file_path)
        elif extension in self.supported_data_types:
            self.preview_data(file_path)
        else:
            st.info(f"Preview not available for {extension} files")
            st.write("**File path:**", file_path)

def main():
    """Main application function"""
    browser = FileBrowser()
    
    # Header
    st.title("📁 File Browser with Live Preview")
    st.markdown("Navigate through directories and preview files in real-time")
    
    # Sidebar for navigation controls
    with st.sidebar:
        st.header("🧭 Navigation")
        
        # Current path display
        st.write("**Current Path:**")
        st.code(st.session_state.current_path, language=None)
        
        # Navigation buttons
        col1, col2 = st.columns(2)
        
        with col1:
            if st.button("⬆️ Parent", use_container_width=True):
                parent = str(pathlib.Path(st.session_state.current_path).parent)
                if parent != st.session_state.current_path:
                    st.session_state.current_path = parent
                    st.session_state.selected_file = None
                    st.rerun()
        
        with col2:
            if st.button("🏠 Home", use_container_width=True):
                st.session_state.current_path = str(pathlib.Path.home())
                st.session_state.selected_file = None
                st.rerun()
        
        # Quick navigation to common directories
        st.write("**Quick Access:**")
        quick_paths = {
            "🖥️ Desktop": str(pathlib.Path.home() / "Desktop"),
            "📁 Documents": str(pathlib.Path.home() / "Documents"),
            "📥 Downloads": str(pathlib.Path.home() / "Downloads"),
            "🖼️ Pictures": str(pathlib.Path.home() / "Pictures"),
        }
        
        for name, path in quick_paths.items():
            if pathlib.Path(path).exists():
                if st.button(name, use_container_width=True):
                    st.session_state.current_path = path
                    st.session_state.selected_file = None
                    st.rerun()
        
        st.divider()
        
        # Folder creation
        st.header("📂 Create Folder")
        new_folder_name = st.text_input("Folder name:", placeholder="Enter folder name")
        
        if st.button("➕ Create Folder", use_container_width=True):
            if new_folder_name:
                success, message = browser.create_folder(st.session_state.current_path, new_folder_name)
                if success:
                    st.success(message)
                    st.rerun()
                else:
                    st.error(message)
            else:
                st.warning("Please enter a folder name")
        
        st.divider()
        
        # Preview settings
        st.header("⚙️ Settings")
        st.session_state.preview_enabled = st.checkbox("Enable Preview", value=st.session_state.preview_enabled)
        st.session_state.auto_refresh = st.checkbox("Auto Refresh", value=st.session_state.auto_refresh)
        
        if st.session_state.auto_refresh:
            refresh_interval = st.slider("Refresh Interval (seconds)", 1, 10, 3)
            if time.time() - st.session_state.last_refresh > refresh_interval:
                st.session_state.last_refresh = time.time()
                st.rerun()
    
    # Main content area
    col1, col2 = st.columns([1, 1])
    
    with col1:
        st.header("📋 Directory Contents")
        
        # Get directory contents
        contents, error = browser.get_directory_contents(st.session_state.current_path)
        
        if error:
            st.error(error)
            return
        
        if not contents:
            st.info("Directory is empty")
            return
        
        # Display contents
        for item in contents:
            info = item['info']
            path = item['path']
            
            # Create item display
            col_icon, col_name, col_size, col_modified = st.columns([0.5, 3, 1, 1.5])
            
            with col_icon:
                icon = "📁" if info['is_dir'] else "📄"
                st.write(icon)
            
            with col_name:
                if st.button(info['name'], key=f"item_{path}", use_container_width=True):
                    if info['is_dir']:
                        st.session_state.current_path = path
                        st.session_state.selected_file = None
                    else:
                        st.session_state.selected_file = path
                    st.rerun()
            
            with col_size:
                if not info['is_dir']:
                    st.write(browser.format_file_size(info['size']))
            
            with col_modified:
                st.write(info['modified'].strftime("%m/%d %H:%M"))
    
    with col2:
        st.header("👁️ Live Preview")
        
        if not st.session_state.preview_enabled:
            st.info("Preview is disabled. Enable it in the sidebar.")
        elif st.session_state.selected_file:
            browser.preview_file(st.session_state.selected_file)
        else:
            st.info("Select a file to preview")
    
    # Status bar
    st.divider()
    status_col1, status_col2, status_col3 = st.columns(3)
    
    with status_col1:
        try:
            item_count = len(browser.get_directory_contents(st.session_state.current_path)[0])
            st.metric("Items", item_count)
        except:
            st.metric("Items", "Error")
    
    with status_col2:
        st.metric("Preview", "Enabled" if st.session_state.preview_enabled else "Disabled")
    
    with status_col3:
        st.metric("Auto Refresh", "On" if st.session_state.auto_refresh else "Off")

if __name__ == "__main__":
    main()