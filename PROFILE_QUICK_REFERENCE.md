# Profile Module - Quick Reference

## 🎯 Start Here

1. **Install deps**: `pnpm install`
2. **Configure env**: Copy `.env.example` to `.env.local`
3. **Create uploads dir**: `mkdir -p uploads/avatars uploads/media`
4. **Apply migration**: `pnpm db:push`
5. **Start dev server**: `pnpm start:dev`
6. **Test endpoints**: Open `http://localhost:4000/api`

## 📍 Key Files

| File | Purpose |
|------|---------|
| `src/modules/user/user.controller.ts` | API endpoints |
| `src/modules/user/services/profile.service.ts` | Business logic |
| `src/modules/user/dto/profile.dto.ts` | Request/response schemas |
| `src/shared/infrastructure/storage/file-storage.service.ts` | File handling |
| `PROFILE_MODULE.md` | Complete documentation |
| `IMPLEMENTATION_SUMMARY.md` | Setup guide |

## 🔌 API Endpoints

### Get Profile
```bash
GET /user/profile
Authorization: Bearer <token>
```

### Update Profile
```bash
PATCH /user/profile
Authorization: Bearer <token>
Content-Type: application/json

{ "bio": "Updated bio", "interests": ["music"] }
```

### Upload Avatar
```bash
POST /user/profile/avatar
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <image.jpg>
```

### Business Profile
```bash
POST /user/profile/business
PATCH /user/profile/business

{ "businessName": "Company", "nip": "1234567890" }
```

### Phone Verification
```bash
POST /user/profile/phone/request-verification
{ "phoneNumber": "+48123456789" }

POST /user/profile/phone/verify
{ "verificationCode": "123456" }
```

## 🗂️ Folder Structure

```
src/modules/user/
├── user.controller.ts
├── user.module.ts
├── dto/
│   ├── index.ts
│   └── profile.dto.ts
└── services/
    ├── index.ts
    └── profile.service.ts

src/shared/infrastructure/storage/
├── index.ts
├── file-storage.service.ts
└── storage.module.ts
```

## 🔄 Data Flow

1. **Controller** receives request + file
2. **Validation** via DTOs (class-validator)
3. **ProfileService** handles business logic
4. **FileStorageService** handles file operations
5. **Database** (Drizzle ORM) persists data
6. **Response** returned with 200/201/4xx status

## 📊 Database

```sql
-- Profiles table with new fields:
- account_type: 'personal' | 'business'
- avatar_url, avatar_storage_path
- phone_number, is_phone_verified
- nip, business_name, business_verification_status
- interests[], followers_count, following_count
- is_private, is_deactivated
```

## 🚀 File Storage Modes

| Mode | Storage | Use Case |
|------|---------|----------|
| Dev | `./uploads/` | Local development |
| Prod | MinIO | Production |
| Future | Cloudflare R2 | Just update env vars! |

## ⚡ Common Tasks

### Test Avatar Upload
```bash
curl -X POST http://localhost:4000/user/profile/avatar \
  -H "Authorization: Bearer <token>" \
  -F "file=@avatar.jpg"
```

### View Swagger Docs
Open: `http://localhost:4000/api`

### Check Uploaded Files
```bash
ls -la ./uploads/avatars/
```

### Debug Phone Verification
Codes are logged to console:
```bash
# Check terminal output for:
# Phone verification code for +48123456789: 123456
```

## ❗ Common Issues

| Issue | Solution |
|-------|----------|
| `ENOENT: uploads directory` | Run `mkdir -p uploads/avatars uploads/media` |
| `File upload failed` | Check file size (<5MB) and type (JPEG/PNG) |
| `Username already taken` | Choose different username |
| `Invalid verification code` | Check console for correct code |
| `Not a business account` | Use POST /business first |

## 🔒 Validation Rules

| Field | Rules |
|-------|-------|
| firstName/lastName | 1-50 chars |
| username | 3-30 chars, alphanumeric + _/- |
| bio | 0-500 chars |
| nip | 10 digits |
| phone | +48 format |
| file | <5MB, image/* |

## 🎓 Next Steps

1. **SMS Integration**: Add Twilio/SNS for phone verification
2. **Search**: Add profile search by interests
3. **Relationships**: Implement follow/unfollow
4. **CDN**: Optimize images for web
5. **Audit**: Add activity logging

## 📚 Full Documentation

- `PROFILE_MODULE.md` - Comprehensive reference
- `IMPLEMENTATION_SUMMARY.md` - Complete setup guide
- Swagger UI - Interactive endpoint testing

---

**Happy coding!** 🚀
