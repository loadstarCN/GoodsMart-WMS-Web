# GoodsMart WMS Client

[中文 README](./README-zh.md)

GoodsMart WMS (Warehouse Management System) Client is a modern web-based frontend interface for warehouse management systems. It provides an intuitive user interface to help businesses manage core functionalities including warehouse operations, inventory control, order processing, and logistics tracking.

> **Important Note**: This project must be used in conjunction with the https://github.com/loadstarCN/GoodsMart-WMS-Backend backend API project to function properly.

## 📜 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

### Important License Terms:
- ✅ **Permitted**: Free use, modification, and distribution
- ✅ **Required**: Open source derivative works, maintain same license
- ✅ **Required**: Clear attribution of copyright and license information
- ✅ **Required**: Declaration of changes to original code
- ❌ **Prohibited**: Commercial use of this software (separate authorization required)
- ❌ **Prohibited**: Closed-source distribution or SaaS services (separate authorization required)

**Commercial Use License**: To use this project for commercial purposes, please contact the author for a commercial license.

## ✨ Features

- 📦 **Inventory Management** - Real-time inventory monitoring and multi-dimensional inventory queries
- 📊 **Data Visualization** - Rich charts and report displays
- 🔍 **Smart Search** - Quick retrieval of products, orders, and inventory information
- 📱 **Responsive Design** - Perfect adaptation for desktop and mobile devices
- 🔐 **Security Authentication** - JWT authentication and permission control
- 🌐 **Multi-language Support** - Internationalization (i18n) support
- 🎨 **Modern UI** - Elegant interface design based on Bootstrap

## 🚀 Tech Stack

- **Frontend Framework**: Nuxt.js 4
- **UI Component Library**: Bootstrap
- **State Management**: Pinia
- **HTTP Client**: Axios
- **Style Preprocessing**: SCSS
- **Build Tool**: Vite
- **Code Quality**: ESLint + Prettier

## 📋 Prerequisites

Before starting, ensure your system has:

- Node.js 18.0.0 or higher
- npm or yarn package manager
- Git
- **https://github.com/loadstarCN/GoodsMart-WMS-Backend** backend service (must be deployed simultaneously)

## ⚡ Quick Start

### 1. First Deploy the API Service

Please ensure the https://github.com/loadstarCN/GoodsMart-WMS-Backend backend service is properly deployed and running at http://localhost:5000

### 2. Clone the Client Project

```bash
git clone https://github.com/loadstarCN/GoodsMart-WMS-Web.git
cd GoodsMart-WMS-Web
```

### 3. Install Dependencies

```bash
npm install
# or
yarn install
```

### 4. Environment Configuration

Copy the environment variable example file and configure your environment variables:

```bash
cp .env.example .env
```

Edit the `.env` file to configure your API address and other environment variables:

```env
# API Configuration - Must point to the deployed GoodsMart-WMS-Backend service
API_BASE_URL=http://localhost:5000

# Encryption key (generate using openssl rand -base64 32)
NUXT_PUBLIC_ENCRYPTION_KEY=your_secure_base64_encryption_key_here

# Other configurations...
```

### 5. Start Development Server

```bash
npm run dev
# or
yarn dev
```

Access http://localhost:3000 to view the application.

### 6. Build Production Version

```bash
npm run build
# or
yarn build
```

Preview production build:

```bash
npm run preview
# or
yarn preview
```

## 🔌 API Integration

**This project must be used in conjunction with the https://github.com/loadstarCN/GoodsMart-WMS-Backend backend API project**. Please ensure:

1. The API service is properly deployed and running
2. The database is initialized and migrations completed
3. Redis service is started (if used)
4. The `API_BASE_URL` in environment variables points to the correct API address

### API Service Deployment Check

Before starting the client, verify API service status:

```bash
# Check if API service is running normally
curl http://localhost:5000/api/health

# Expected response: {"status":"healthy","message":"API service is running"}
```

## 🗂️ Project Structure

```
GoodsMart-WMS-Web/
├── assets/          # Static resources (styles, images, etc.)
├── components/      # Vue components
├── composables/     # Composable functions
├── layouts/         # Layout components
├── locales/         # Internationalization files
├── middleware/      # Middleware
├── pages/           # Page components
├── plugins/         # Nuxt plugins
├── public/          # Public static files
├── server/          # Server-side API and middleware
├── stores/          # Pinia state management
├── types/           # TypeScript type definitions
└── utils/           # Utility functions
```

## 🛠️ Development Guide

### Adding New Pages

Create `.vue` files in the `pages` directory to automatically generate routes.

### State Management

Use Pinia for state management, create store files in the `stores` directory.

### Custom Components

Create reusable Vue components in the `components` directory.

### API Call Example

```javascript
// Calling API in Vue components
const { data: products, error } = await useFetch('/api/products', {
  baseURL: runtimeConfig.public.apiBaseUrl,
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
```

## 📦 Deployment

### Complete System Deployment Process

1. **First Deploy API Service**
   ```bash
   # Deploy GoodsMart-WMS-Backend
   git clone https://github.com/loadstarCN/GoodsMart-WMS-Backend.git
   cd GoodsMart-WMS-Backend
   # ... Follow the API project's README for deployment
   ```

2. **Then Deploy Client**
   ```bash
   # Deploy GoodsMart-WMS-Web
   git clone https://github.com/loadstarCN/GoodsMart-WMS-Web.git
   cd GoodsMart-WMS-Web
   # ... Follow the guide below for deployment
   ```

### Using Supervisord (Production Environment)

1. Install Supervisord:

```bash
sudo apt-get install supervisor
```

2. Create configuration file:

```bash
sudo nano /etc/supervisor/conf.d/nuxt-wms.conf
```

Add the following content:

```ini
[program:nuxt-wms]
directory=/path/to/GoodsMart-WMS-Web
command=npm start
autostart=true
autorestart=true
environment=NODE_ENV="production"
stderr_logfile=/var/log/nuxt-wms.err.log
stdout_logfile=/var/log/nuxt-wms.out.log
user=www-data
```

3. Supervisord Common Commands:

```bash
# Restart Supervisord
sudo systemctl restart supervisor

# Check status
sudo supervisorctl status

# Restart process
sudo supervisorctl restart nuxt-wms

# Reload configuration
sudo supervisorctl reread
sudo supervisorctl update
```

### Using PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start ecosystem.config.js

# Check application status
pm2 status

# Restart application
pm2 restart nuxt-wms

# Stop application
pm2 stop nuxt-wms
```

Create `ecosystem.config.js` file:

```javascript
module.exports = {
  apps: [{
    name: 'nuxt-wms',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      API_BASE_URL: 'http://your-api-server:5000'
    }
  }]
}
```

## 🤝 Contribution Guidelines

We welcome contributions of any kind! Please read our contribution guidelines:

1. Fork this project
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 🆘 Support

If you encounter any issues or have questions, please:

1. Ensure the API service is properly deployed and running
2. Check https://github.com/loadstarCN/GoodsMart-WMS-Web/wiki
3. Search https://github.com/loadstarCN/GoodsMart-WMS-Web/issues
4. Submit a new Issue

## 🔗 Related Projects

This project is part of the GoodsMart WMS system. Related project links:

https://github.com/loadstarCN/GoodsMart-WMS - Contains documentation and coordination information for the complete system  
https://github.com/loadstarCN/GoodsMart-WMS-Backend - Backend service that must be used together

Developers are advised to also follow the main repository for the latest system updates and complete documentation.

## 🙏 Acknowledgments

Thanks to all developers who have contributed to this project.

---

**Important Notes**: 
- This is an open-source project, ensure no sensitive information (such as API keys, database credentials, etc.) is committed to version control.
- Use environment variables to manage sensitive configurations.
- **This project must be used in conjunction with https://github.com/loadstarCN/GoodsMart-WMS-Backend** - deploying the client alone will not work.
- This project uses AGPLv3 license, **commercial use is prohibited**, contact the author for commercial licensing if needed.