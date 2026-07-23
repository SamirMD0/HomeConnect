# Rename and Move Renderer
Rename-Item -Path "src\renderer" -NewName "src_frontend"
Move-Item -Path "src\src_frontend" -Destination "frontend\src"

# Rename and Move Server
Rename-Item -Path "src\server" -NewName "src_backend"
Move-Item -Path "src\src_backend" -Destination "backend\src"

# Create desktop and Move Main
New-Item -ItemType Directory -Force -Path "desktop"
Rename-Item -Path "src\main" -NewName "src_desktop"
Move-Item -Path "src\src_desktop" -Destination "desktop\src"

# Move config files for frontend
Move-Item -Path "vite.config.ts" -Destination "frontend\"
Move-Item -Path "tailwind.config.js" -Destination "frontend\"
Move-Item -Path "postcss.config.js" -Destination "frontend\"
Move-Item -Path "index.html" -Destination "frontend\"

# Move backend dependencies
Move-Item -Path "prisma" -Destination "backend\"
Move-Item -Path ".env" -Destination "backend\"
Move-Item -Path ".env.example" -Destination "backend\"

# Remove empty src
Remove-Item -Path "src" -Force
