# GoodsMart WMS 客户端
GoodsMart WMS (Warehouse Management System) 客户端是一个基于现代Web技术栈构建的仓库管理系统前端界面。该系统提供了直观的用户界面，帮助企业管理仓库运营、库存控制、订单处理和物流跟踪等核心功能。

> **重要提示**: 本项目必须与 https://github.com/loadstarCN/GoodsMart-WMS-Backend 后端API项目配合使用才能正常运行。

## 📜 许可证

本项目采用 **GNU Affero General Public License v3.0 (AGPL-3.0)** 许可证。

### 重要许可条款：
- ✅ **允许**：自由使用、修改和分发
- ✅ **要求**：开源衍生作品，保持相同许可证
- ✅ **要求**：明确标注版权和许可信息
- ✅ **要求**：声明对原始代码的更改
- ❌ **禁止**：将本软件用于商业用途（需单独授权）
- ❌ **禁止**：闭源分发或SaaS服务（需单独授权）

**商业使用许可**：如需将本项目用于商业用途，请联系作者获取商业许可证。

## ✨ 功能特性

- 📦 **库存管理** - 实时库存监控和多维度库存查询
- 📊 **数据可视化** - 丰富的图表和报表展示
- 🔍 **智能搜索** - 快速检索商品、订单和库存信息
- 📱 **响应式设计** - 完美适配桌面和移动设备
- 🔐 **安全认证** - JWT身份验证和权限控制
- 🌐 **多语言支持** - 国际化(i18n)支持
- 🎨 **现代化UI** - 基于Bootstrap的优雅界面设计

## 🚀 技术栈

- **前端框架**: Nuxt.js 4
- **UI组件库**: Bootstrap
- **状态管理**: Pinia
- **HTTP客户端**: Axios
- **样式预处理**: SCSS
- **构建工具**: Vite
- **代码质量**: ESLint + Prettier

## 📋 前置要求

在开始之前，请确保您的系统已安装：

- Node.js 18.0.0 或更高版本
- npm 或 yarn 包管理器
- Git
- **https://github.com/loadstarCN/GoodsMart-WMS-Backend** 后端服务（必须同时部署）

## ⚡ 快速开始

### 1. 首先部署API服务

请先确保 https://github.com/loadstarCN/GoodsMart-WMS-Backend 后端服务已正确部署并运行在 http://localhost:5000

### 2. 克隆客户端项目

```bash
git clone https://github.com/loadstarCN/GoodsMart-WMS-Web.git
cd GoodsMart-WMS-Web
```

### 3. 安装依赖

```bash
npm install
# 或
yarn install
```

### 4. 环境配置

复制环境变量示例文件并配置您的环境变量：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置您的API地址和其他环境变量：

```env
# API配置 - 必须指向已部署的GoodsMart-WMS-Backend服务
API_BASE_URL=http://localhost:5000

# 加密密钥（使用 openssl rand -base64 32 生成）
NUXT_PUBLIC_ENCRYPTION_KEY=your_secure_base64_encryption_key_here

# 其他配置...
```

### 5. 启动开发服务器

```bash
npm run dev
# 或
yarn dev
```

访问 http://localhost:3000 查看应用。

### 6. 构建生产版本

```bash
npm run build
# 或
yarn build
```

预览生产构建：

```bash
npm run preview
# 或
yarn preview
```

## 🔌 API 集成

**本项目必须与 https://github.com/loadstarCN/GoodsMart-WMS-Backend 后端API项目配合使用**。请确保：

1. API服务已正确部署并运行
2. 数据库已初始化并迁移完成
3. Redis服务已启动（如使用）
4. 环境变量中的 `API_BASE_URL` 指向正确的API地址

### API服务部署检查

在启动客户端前，请验证API服务状态：

```bash
# 检查API服务是否正常运行
curl http://localhost:5000/api/health

# 预期响应: {"status":"healthy","message":"API service is running"}
```

## 🗂️ 项目结构

```
GoodsMart-WMS-Web/
├── assets/          # 静态资源（样式、图片等）
├── components/      # Vue组件
├── composables/     # 组合式函数
├── layouts/         # 布局组件
├── locales/         # 国际化文件
├── middleware/      # 中间件
├── pages/           # 页面组件
├── plugins/         # Nuxt插件
├── public/          # 公共静态文件
├── server/          # 服务器端API和中间件
├── stores/          # Pinia状态管理
├── types/           # TypeScript类型定义
└── utils/           # 工具函数
```

## 🛠️ 开发指南

### 添加新页面

在 `pages` 目录下创建 `.vue` 文件即可自动生成路由。

### 状态管理

使用 Pinia 进行状态管理，在 `stores` 目录下创建 store 文件。

### 自定义组件

在 `components` 目录下创建可复用的 Vue 组件。

### API调用示例

```javascript
// 在Vue组件中调用API
const { data: products, error } = await useFetch('/api/products', {
  baseURL: runtimeConfig.public.apiBaseUrl,
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
```

## 📦 部署

### 完整系统部署流程

1. **首先部署API服务**
   ```bash
   # 部署GoodsMart-WMS-Backend
   git clone https://github.com/loadstarCN/GoodsMart-WMS-Backend.git
   cd GoodsMart-WMS-Backend
   # ... 按照API项目的README进行部署
   ```

2. **然后部署客户端**
   ```bash
   # 部署GoodsMart-WMS-Web
   git clone https://github.com/loadstarCN/GoodsMart-WMS-Web.git
   cd GoodsMart-WMS-Web
   # ... 按照以下指南进行部署
   ```

### 使用 Supervisord (生产环境)

1. 安装 Supervisord：

```bash
sudo apt-get install supervisor
```

2. 创建配置文件：

```bash
sudo nano /etc/supervisor/conf.d/nuxt-wms.conf
```

添加以下内容：

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

3. Supervisord 常用命令：

```bash
# 重启 Supervisord
sudo systemctl restart supervisor

# 查看状态
sudo supervisorctl status

# 重启进程
sudo supervisorctl restart nuxt-wms

# 重新加载配置
sudo supervisorctl reread
sudo supervisorctl update
```

### 使用 PM2

```bash
# 全局安装 PM2
npm install -g pm2

# 启动应用
pm2 start ecosystem.config.js

# 查看应用状态
pm2 status

# 重启应用
pm2 restart nuxt-wms

# 停止应用
pm2 stop nuxt-wms
```

创建 `ecosystem.config.js` 文件：

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

## 🤝 贡献指南

我们欢迎任何形式的贡献！请阅读我们的贡献指南：

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启一个 Pull Request

## 🆘 支持

如果您遇到任何问题或有任何疑问，请：

1. 确保API服务已正确部署并运行
2. 查看 https://github.com/loadstarCN/GoodsMart-WMS-Web/wiki
3. 搜索 https://github.com/loadstarCN/GoodsMart-WMS-Web/issues
4. 提交新的 Issue

## 🔗 关联项目

本项目是 GoodsMart WMS 系统的一部分，相关项目链接：

https://github.com/loadstarCN/GoodsMart-WMS - 包含完整系统的文档和协调信息  
https://github.com/loadstarCN/GoodsMart-WMS-Backend - 必须配合使用的后端服务  

建议开发者同时关注主仓库以获取最新系统更新和完整文档。


## 🙏 致谢

感谢所有为这个项目做出贡献的开发者。

---

**重要提示**: 
- 这是一个开源项目，请确保不要将任何敏感信息（如API密钥、数据库凭证等）提交到版本控制系统。
- 使用环境变量来管理敏感配置。
- **本项目必须与 https://github.com/loadstarCN/GoodsMart-WMS-Backend 配合使用**，单独部署客户端无法正常工作。
- 本项目采用AGPLv3许可证，**禁止商业使用**，如需商业用途请联系作者获取商业许可。