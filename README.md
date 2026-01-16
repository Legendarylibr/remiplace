# (r) EMI / Place

A production-ready, token-gated collaborative pixel canvas with full backend support. NFT holders can place pixels on a shared grid with real-time synchronization.

## Features

- **Full Backend**: Node.js/Express server with SQLite database
- **Real-time Sync**: WebSocket support for live pixel updates
- **Token-Gated Access**: Optional NFT verification for pixel placement
- **JWT Authentication**: Secure wallet-based authentication
- **Rate Limiting**: Protection against abuse
- **Modular Architecture**: Clean separation of concerns
- **Multi-Wallet Support**: MetaMask and WalletConnect v2
- **Responsive Design**: Works on desktop and mobile

## Project Structure

```
Drawingboard/
├── index.html              # Frontend entry point
├── style.css               # Frontend styles
├── script.js               # Frontend main application
├── client/                 # Frontend modules
│   ├── index.js            # Module re-exports
│   ├── config.js           # Configuration settings
│   ├── utils.js            # Utility functions & logger
│   ├── api.js              # Backend API client
│   ├── websocket.js        # WebSocket client
│   ├── WalletManager.js    # Wallet connection handling
│   └── PixelCanvas.js      # Canvas rendering
├── server/                 # Backend
│   ├── index.js            # Server entry point
│   ├── package.json        # Dependencies
│   ├── .env.example        # Environment template
│   ├── config/
│   │   └── index.js        # Configuration module
│   ├── middleware/
│   │   ├── auth.js         # JWT authentication
│   │   ├── rateLimit.js    # Rate limiting
│   │   ├── errorHandler.js # Error handling
│   │   └── validation.js   # Request validation
│   ├── models/
│   │   └── database.js     # SQLite database
│   ├── routes/
│   │   ├── index.js        # Route aggregator
│   │   ├── auth.js         # Auth endpoints
│   │   ├── canvas.js       # Canvas endpoints
│   │   └── pixels.js       # Pixel endpoints
│   ├── services/
│   │   ├── auth.js         # Auth logic
│   │   ├── canvas.js       # Canvas logic
│   │   └── nft.js          # NFT verification
│   └── websocket/
│       └── index.js        # WebSocket server
└── README.md
```

## Quick Start

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Configure Environment

```bash
# Copy the example environment file
cp env.example .env

# Edit .env with your settings
# At minimum, change JWT_SECRET in production
```

### 3. Start the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

### 4. Access the Application

Open http://localhost:3001 in your browser.

## API Endpoints

### Health & Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Liveness probe |
| GET | `/health/ready` | Readiness probe |
| GET | `/health/detailed` | Detailed health with memory, DB stats |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/connect` | Authenticate with signature |
| POST | `/api/auth/refresh` | Refresh authorization |
| GET | `/api/auth/profile` | Get user profile |
| GET | `/api/auth/verify` | Verify current token |

### Canvas

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/canvas` | Get full canvas state |
| GET | `/api/canvas/config` | Get canvas configuration |
| GET | `/api/canvas/export` | Export canvas as JSON |
| POST | `/api/canvas/import` | Import canvas (admin only) |
| GET | `/api/canvas/stats` | Get canvas statistics |
| GET | `/api/canvas/history` | Get placement history |
| GET | `/api/canvas/palette` | Get color palette |
| DELETE | `/api/canvas` | Clear canvas (admin only) |

### Pixels

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pixels/:x/:y` | Get single pixel |
| POST | `/api/pixels` | Place a pixel (auth required) |
| POST | `/api/pixels/batch` | Place multiple pixels (auth required) |
| DELETE | `/api/pixels/:x/:y` | Erase a pixel (admin only) |
| GET | `/api/pixels/user/:address` | Get user's pixel history |

### WebSocket

Connect to `/ws` for real-time updates.

**Message Types:**
- `connected` - Connection established
- `pixel` - Single pixel placed
- `batch` - Multiple pixels placed

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `NODE_ENV` | development | Environment mode |
| `DATABASE_PATH` | ./data/canvas.db | SQLite database path |
| `JWT_SECRET` | (required) | JWT signing secret |
| `JWT_EXPIRES_IN` | 24h | Token expiration |
| `CORS_ORIGIN` | * | Allowed origins |
| `RATE_LIMIT_WINDOW_MS` | 60000 | Rate limit window |
| `RATE_LIMIT_MAX_REQUESTS` | 100 | Max requests per window |
| `PIXEL_RATE_LIMIT` | 30 | Max pixel placements per window |
| `CANVAS_WIDTH` | 220 | Canvas width in pixels |
| `CANVAS_HEIGHT` | 150 | Canvas height in pixels |
| `NFT_GATING_ENABLED` | false | Enable NFT verification |
| `ETH_RPC_URL` | (public) | Ethereum RPC URL |
| `BASE_RPC_URL` | (public) | Base RPC URL |
| `ERC721_CONTRACTS` | [] | ERC-721 contracts JSON |
| `ERC1155_CONTRACTS` | [] | ERC-1155 contracts JSON |
| `ADMIN_WALLETS` | | Comma-separated admin wallet addresses |

### NFT Configuration

To enable token-gating:

1. Set `NFT_GATING_ENABLED=true`
2. Configure your NFT contracts:

```bash
# ERC-721
ERC721_CONTRACTS='[{"address": "0x1234...", "name": "My NFT Collection"}]'

# ERC-1155
ERC1155_CONTRACTS='[{"address": "0x5678...", "name": "My Items", "tokenIds": [1, 2, 3]}]'
```

Users holding any configured NFT will be authorized to place pixels.

### Frontend Configuration

In `script.js`, update:

```javascript
const CONFIG = {
  USE_BACKEND: true,           // Enable backend integration
  OPEN_MODE: true,             // Allow everyone (disable NFT gating)
  WALLETCONNECT_PROJECT_ID: 'your-project-id',
};
```

## Development

### Running in Development Mode

```bash
cd server
npm run dev
```

This enables:
- Auto-reload on file changes
- Request logging
- Detailed error messages

### Database

The SQLite database is automatically created at startup. Tables:
- `pixels` - Current canvas state
- `pixel_history` - Audit log of all placements
- `users` - User statistics
- `sessions` - Optional session storage
- `canvas_snapshots` - Periodic backups

### Adding New Features

**New API Route:**
1. Create route file in `server/routes/`
2. Add service logic in `server/services/`
3. Register in `server/routes/index.js`

**New Middleware:**
1. Create middleware in `server/middleware/`
2. Apply to routes as needed

## Production Deployment

### Environment Setup

```bash
# Set production environment
NODE_ENV=production

# Use a strong JWT secret
JWT_SECRET=your-256-bit-secret-key

# Restrict CORS
CORS_ORIGIN=https://yourdomain.com
```

### Running with PM2

```bash
npm install -g pm2
pm2 start server/index.js --name romelia-house
pm2 save
```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["node", "server/index.js"]
```

## Security

- **JWT Authentication**: Wallet signatures verify identity
- **Rate Limiting**: Prevents abuse and DoS attacks
- **Input Validation**: All inputs validated and sanitized
- **CORS Protection**: Configurable origin restrictions
- **Helmet**: Security headers enabled (including CSP in production)
- **No SQL Injection**: Parameterized queries
- **Admin Controls**: Destructive operations require admin privileges
- **Request Tracing**: All requests include X-Request-ID for debugging
- **Structured Logging**: JSON logs in production for easy parsing
- **Graceful Shutdown**: Proper cleanup of connections and database

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| 1-9 | Select color from palette |
| E | Toggle eraser mode (admin only) |

## Browser Support

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## License

MIT License

## Credits

Built with:
- [Express](https://expressjs.com/) - Web framework
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite database
- [ethers.js](https://docs.ethers.org/) - Ethereum library
- [WalletConnect](https://walletconnect.com/) - Multi-wallet support
- [ws](https://github.com/websockets/ws) - WebSocket implementation

---

**(r) EMI / Place** - Where community creates, one pixel at a time.
