# CeramiSys ERP - Complete Development Plan

## Part 1: Detailed API REST Module Development Plan

### 1.1 Current Architecture Analysis

**Technology Stack:**
- Frontend: React 18 + TypeScript + TailwindCSS + HashRouter
- Desktop App: Electron 45 (web-based renderer)
- Database: SQLite with sql.js (file-based storage)
- Backend: Node.js + TypeScript
- Database Access: Custom DatabaseManager class

**Current Integration Points:**
- Renderer ↔ Main Process via IPC (Named pipes)
- DatabaseManager provides singleton pattern for shared database access
- Permissions System: 200+ permission codes with granular controls
- Authentication: Bcrypt password hashing, session management in DB

### 1.2 API Design Approach

#### 1.2.1 Architecture Options
**Option A: External Node.js/Express Server**
- Pros: Standard REST API, easier to connect external clients, consistent with web patterns
- Cons: Doubles architecture complexity, need to synchronize DB access
- Recommendation: NOT recommended (overkill for this use case)

**Option B: Express/Fastify Server with Router Integration**
- Pros: Fits existing patterns, can leverage DatabaseManager
- Cons: Need to handle Electron vs browser environments
- Recommendation: Use with router guard

**Option C: Module Service + CORS + API Gateway** (RECOMMENDED)
- Expose API through the Electron app itself via a secure gateway
- Use JWT tokens for API access
- API running on port 3001 (separate from Electron's Vite dev server)
- Maintain backward compatibility with Desktop app

#### 1.2.2 API Structure (RESTful)

Base URLs:
- `http://localhost:3001/api/v1/` (Production)
- `http://127.0.0.1:3001/api/v1/` (Testing)

**Mandatory Headers:**
- `Authorization: Bearer <token>`
- `Content-Type: application/json`
- `X-API-Key: <api-key>` (if using API-Key mode)

**API Endpoints by Module:**

1. **Authentication & Users** (`/auth/*`)
   - POST `/api/v1/auth/login` - Get JWT token
   - POST `/api/v1/auth/register` - Register new API user
   - GET `/api/v1/users/me` - Get current user profile
   - GET `/api/v1/users` - List users (requires admin)
   - PUT `/api/v1/users/:id` - Update user
   - DELETE `/api/v1/users/:id` - Delete user (requires admin)

2. **Products & Categories** (`/products/*`)
   - GET `/api/v1/products` - List all products
   - GET `/api/v1/products/:id` - Get product details
   - POST `/api/v1/products` - Create product
   - PUT `/api/v1/products/:id` - Update product
   - DELETE `/api/v1/products/:id` - Delete product
   - GET `/api/v1/categories` - List categories
   - GET `/api/v1/categories/:id` - Get category
   - POST `/api/v1/categories` - Create category
   - PUT `/api/v1/categories/:id` - Update category

3. **Inventory** (`/inventory/*`)
   - GET `/api/v1/inventory` - List inventory
   - POST `/api/v1/inventory` - Create transaction
   - GET `/api/v1/inventory/stock-levels` - Current stock levels
   - PUT `/api/v1/inventory/adjust/:productId` - Adjust stock

4. **Sales** (`/sales/*`)
   - GET `/api/v1/sales/invoices` - List invoices
   - POST `/api/v1/sales/invoices` - Create invoice
   - PUT `/api/v1/sales/invoices/:id` - Update invoice
   - GET `/api/v1/sales/customer-history/:customerId` - Customer purchase history

5. **Purchases** (`/purchases/*`)
   - GET `/api/v1/purchases/purchase-orders` - List purchase orders
   - POST `/api/v1/purchases/purchase-orders` - Create PO
   - GET `/api/v1/purchases/suppliers` - List suppliers

6. **CRM** (`/customers/*`)
   - GET `/api/v1/customers` - List customers
   - POST `/api/v1/customers` - Create customer
   - GET `/api/v1/customers/:id` - Get customer details

7. **Finance & Reports** (`/finance/*`)
   - GET `/api/v1/finance/invoices-summary` - Financial summaries
   - GET `/api/v1/finance/reports/profit-loss` - Profit & Loss report
   - GET `/api/v1/finance/reports/balance-sheet` - Balance sheet

8. **System** (`/system/*`)
   - GET `/api/v1/system/backup/now` - Trigger backup
   - GET `/api/v1/system/settings` - Get system settings
   - PUT `/api/v1/system/settings` - Update settings

### 1.3 Authentication & Authorization

**JWT with Refresh Tokens:**
- Access token: 15 minute expiry (short-lived)
- Refresh token: 7 day expiry (stored in DB)
- Token stored in `user_tokens` table alongside sessions

**Permission Mapping:**
All API endpoints require permission checks similar to current UI permissions.
Example:
- `GET /api/v1/products` requires `products.view`
- `POST /api/v1/products` requires `products.create`
- `DELETE /api/v1/products/:id` requires `products.delete`

**Permission Enforcement:**
Middleware pattern at API layer:
```javascript
function requirePermission(permission) {
  return (req, res, next) => {
    const user = decodeToken(req.headers.authorization);
    if (!PermissionService.can(user, permission)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    next();
  };
}
```

### 1.4 Security Considerations

1. **HTTPS Only** (Production, self-signed certs may be used in production)
2. **Rate Limiting**: 1000 requests per hour per API key/user
3. **CORS**: Only allow requests from trusted origins
4. **Input Validation**: Use `zod` or `joi` for schema validation
5. **SQL Injection**: Use prepared statements (already in DatabaseManager)
6. **XSS Protection**: Sanitize data on both client and server
7. **API Key Rotations**: Keys expire every 90 days

### 1.5 Technology Stack for API Layer

**Recommended Components:**
- Server: `fastify` (very fast, built-in validation, TypeScript support)
- Router: `fastify-swagger` for OpenAPI documentation
- Authentication: `fastify-jwt`
- Validation: `fastify-zod`
- Database: `sql.js` (sqlite3-wasm) or directly use SQLite3 for native access

**Alternative:** Use existing Electron IPC to expose API layer instead of new server.

### 1.6 Implementation Phases

**Phase 1: Foundation (Weeks 1-2)**
- Set up Fastify server
- Implement JWT authentication system
- Add basic routing and permission middleware
- Create auth endpoints (`/login`, `/register`)

**Phase 2: Core Resources (Weeks 3-4)**
- Implement CRUD for Products, Categories, Brands
- Add inventory management endpoints
- Implement customer and supplier management

**Phase 3: Transaction APIs (Weeks 5-6)**
- Sales invoices and purchase orders
- Inventory transactions (adjustments, transfers)
- Integration with existing DatabaseManager

**Phase 4: Advanced Features (Weeks 7-8)**
- Reports and analytics endpoints
- Backup and restore via API
- WebSocket for real-time notifications

**Phase 5: Testing & Documentation (Weeks 9-10)**
- API documentation with Swagger UI
- Comprehensive unit and integration tests
- Performance testing and load optimization

### 1.7 File Structure (New Files)

```
/src/api/
  ├── app.ts              # Fastify app initialization
  ├── routes/
  │   ├── auth.ts         # Auth routes
  │   ├── products.ts     # Product routes
  │   ├── customers.ts    # Customer routes
  │   └── ...
  ├── middleware/
  │   ├── auth.ts         # JWT auth middleware
  │   ├── permissions.ts  # Permission checks
  │   └── errorHandler.ts # Global error handling
  ├── config/
  │   ├── server.ts       # Server config
  │   └── cors.ts         # CORS config
  └── types/
      ├── api.response.ts # API response types
     masalahan
```

## Part 2: Code Review Against Best Practices

### 2.1 Critical Security Issues

**1. Hardcoded Default Admin Password (HIGH SEVERITY)**
- File: `d:\ma3rad\src\database\db.ts` line 417
- Issue: `admin123` is hardcoded and used in development
- Recommendation: Use environment variables, prompt on first run, require mandatory password change

**2. Insufficient Session Validation**
- File: `d:\ma3rad\src\services\AuthService.ts`
- Issue: Session data stored in localStorage (not secure in browser context)
- Recommendation: Use HttpOnly cookies or server-side session store

**3. Weak Password Policy**
- File: `d:\ma3rad\src\services\AuthService.ts` line 149-164
- Issue: No complexity checks (capital letters, special characters)
- Recommendation: Implement stronger password validation

**4. SQL Injection via Stored Procedures**
- File: Numerous service files
- Issue: Direct query construction with有些 hardcoded values
- Recommendation: Sanitize ALL inputs, use prepared statements more consistently

**5. Insecure Storage of Sensitive Data**
- File: `d:\ma3rad\electron\main.js` line 14-18
- Issue: App data stored in `app.getPath('appData')` without encryption
- Recommendation: Use `node-forge` or `crypto-js` to encrypt sensitive data at rest

### 2.2 Architecture & Code Organization

**1. Monolithic Services (MEDIUM)**
- Issue: Services are very large and handle multiple concerns
- Recommendation: Split into smaller, more cohesive modules (e.g., `InventoryMovementService`, `StockService`)

**2. Database MANAGER Complexity (MEDIUM)**
- Issue: DatabaseManager is ~800 lines, hard to test
- Recommendation: Extract database operations to separate repository layer

**3. Inconsistent Error Handling**
- Issue: Mix of throw Error, `try-catch` with `.catch()`, and custom AppError
- Recommendation: Standardize on a single error handling framework with error classes

**4. Missing TypeScript Strict Mode**
- Issue: `@ts-ignore` comments, `any` types used frequently
- Recommendation: Enable strict mode (`"strict": true` in tsconfig)

### 2.3 Performance Optimizations

**1. Database Connection Management**
- Issue: Singleton pattern may cause race conditions
- Recommendation: Use connection pooling or async queue pattern

**2. Large Query Result Sets**
- Issue: Queries load all rows into memory
- Recommendation: Implement pagination, cursors, or streaming

**3. Missing Caching Layer**
- Issue: No Redis or in-memory cache for frequently accessed data
- Recommendation: Add caching with TTL for user sessions, product catalogs

**4. Event Loop Blocking**
- Issue: Synchronous database writes in Electron main process
- Recommendation: Use async operations, worker threads for heavy tasks

### 2.4 Testing & Documentation

**1. Missing Unit Tests**
- Issue: No test coverage specified in package.json for API or services
- Recommendation: Implement Jest/Playwright tests with 80%+ coverage

**2. Incomplete API Documentation**
- Issue: No OpenAPI/Swagger documentation
- Recommendation: Generate API documentation automatically

**3. Inconsistent Logging**
- Issue: Mix of console.log and custom logging
- Recommendation: Integrate a structured logging library (win dite, pino)

### 2.5 Code Quality Improvements

**1. Code Smells**
- Long functions (>50 lines common)
- High cyclomatic complexity
- Code duplication in service methods

**2. Naming Conventions**
- Mixed camelCase and PascalCase in unexpected places
- Inconsistent parameter names (some with `&` instead of `:`)

**3. UI/UX Issues**
- Hardcoded Arabic strings in TypeScript code
- Recommendation: Use i18next for internationalization

**4. Accessibility**
- Missing ARIA labels
- Inconsistent keyboard navigation
- Recommendation: Audit and comply with WCAG 2.1

### 2.6 Migration Strategy

**For API REST Implementation:**
1. Set up Fastify server with TypeScript
2. Create authentication middleware compatible with existing users
3. Implement permission layer reusing PermissionService
4. Build core resource routes incrementally
5. Add comprehensive error handling
6. Document with Swagger UI
7. Test with Postman collection
8. Deploy with Docker configuration

**For Code Review Follow-up:**
1. Fix hardcoded admin password IMMEDIATELY
2. Upgrade password policy
3. Enable TypeScript strict mode
4. Add missing unit tests
5. Implement comprehensive API documentation
6. Add error tracking and monitoring

---

## Summary

This comprehensive plan provides:
1. **Detailed API REST architecture** with security considerations
2. **Step-by-step implementation roadmap** (10 phases)
3. **Code audit** identifying critical security and quality issues
4. **Recommended technology stack** and migration strategy
5. **Best practices** to align with industry standards

The API layer can coexist with the existing Desktop Electron app while providing secure access for external systems and potential web/mobile clients.
