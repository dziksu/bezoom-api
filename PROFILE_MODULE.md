# User Profile Module Documentation

## Overview

The User Profile Module provides comprehensive profile management for BeZoom users, supporting both personal and business profiles. It includes:

- ✅ Personal profile management (CRUD operations)
- ✅ Business profile management with NIP verification
- ✅ Avatar upload and storage
- ✅ Phone number verification
- ✅ Account type management (personal/business)
- ✅ Privacy settings
- ✅ Social metrics (followers/following counts)
- ✅ S3-compatible storage (MinIO) with local disk fallback for development

## Architecture

### File Storage Strategy

The module uses a **dual-mode file storage system**:

#### Development Mode (`NODE_ENV !== 'production'`)
- Files are stored on **local disk** at `./uploads` directory
- No MinIO dependency required
- Perfect for local development and testing
- Files are organized by bucket: `./uploads/avatars/`, `./uploads/media/`, etc.

#### Production Mode (`NODE_ENV === 'production'`)
- Files are stored in **MinIO** S3-compatible object storage
- Easy migration to Cloudflare R2 (same S3 API)
- Configurable endpoints and credentials via environment variables

### Service Layer

```
FileStorageService (Abstraction)
├── uploadFile()         - Upload file with validation
├── deleteFile()         - Delete file from storage
├── getFileUrl()         - Get URL for file access
├── validateFile()       - Validate file before upload
├── uploadToMinIO()      - MinIO implementation
└── uploadToLocal()      - Local storage implementation

ProfileService
├── getProfileBySub()           - Get profile by Keycloak ID
├── getProfileById()            - Get profile by profile ID
├── getMyProfile()              - Get authenticated user's profile
├── createProfile()             - Create profile (on registration)
├── updateProfile()             - Update personal profile
├── uploadAvatar()              - Upload and store avatar
├── deleteAvatar()              - Remove avatar
├── createBusinessProfile()     - Create business profile
├── updateBusinessProfile()     - Update business info
├── requestPhoneVerification()  - Request SMS code
└── verifyPhone()               - Verify phone with code
```

## Database Schema

### Profiles Table

```sql
profiles (
  id: UUID (Primary Key)
  keycloak_sub: Text (Unique) - Keycloak user ID
  account_type: Varchar - 'personal' or 'business'
  first_name: Text
  last_name: Text
  username: Text (Unique)
  email: Text
  phone_number: Text
  bio: Text
  avatar_url: Text - URL to avatar
  avatar_storage_path: Text - Storage path for cleanup
  interests: Text[] - Array of interest tags
  
  // Business fields
  business_name: Text
  nip: Varchar(10) (Unique) - Polish tax ID
  business_description: Text
  website_url: Text
  
  // Verification
  is_phone_verified: Boolean
  phone_verification_token: Text (temporary)
  business_verification_status: Varchar - 'unverified'|'pending'|'verified'|'rejected'
  business_verification_date: Timestamp
  
  // Social
  followers_count: Integer
  following_count: Integer
  
  // Settings
  is_private: Boolean
  is_deactivated: Boolean
  
  // Timestamps
  created_at: Timestamp
  updated_at: Timestamp
)
```

## API Endpoints

### Personal Profile

#### Get Current User's Profile
```http
GET /user/profile
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "uuid",
  "keycloakSub": "sub",
  "accountType": "personal",
  "firstName": "John",
  "lastName": "Doe",
  "username": "johndoe",
  "email": "john@example.com",
  "bio": "Loves events!",
  "avatarUrl": "/uploads/avatars/file.jpg",
  "interests": ["music", "sports"],
  "followersCount": 42,
  "followingCount": 15,
  "isPrivate": false,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

#### Get Public Profile
```http
GET /user/profile/:profileId
Authorization: Bearer <token>
```

#### Update Profile
```http
PATCH /user/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "username": "johndoe",
  "bio": "Updated bio",
  "interests": ["music", "sports", "art"],
  "isPrivate": false
}
```

### Avatar Management

#### Upload Avatar
```http
POST /user/profile/avatar
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <binary image data>
```

**Constraints:**
- Max size: 5MB
- Allowed types: JPEG, PNG, WebP, GIF
- Old avatar is automatically deleted

#### Delete Avatar
```http
DELETE /user/profile/avatar
Authorization: Bearer <token>
```

### Business Profile

#### Create Business Profile
```http
POST /user/profile/business
Authorization: Bearer <token>
Content-Type: application/json

{
  "businessName": "My Company",
  "nip": "1234567890",
  "businessDescription": "We provide amazing services",
  "websiteUrl": "https://example.com",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Notes:**
- NIP must be 10 digits
- NIP must be unique across all businesses
- Creates verification pending status
- Account type converted to 'business'

#### Update Business Profile
```http
PATCH /user/profile/business
Authorization: Bearer <token>
Content-Type: application/json

{
  "businessName": "Updated Company Name",
  "businessDescription": "Updated description"
}
```

### Phone Verification

#### Request Phone Verification
```http
POST /user/profile/phone/request-verification
Authorization: Bearer <token>
Content-Type: application/json

{
  "phoneNumber": "+48123456789"
}
```

**Response:**
```json
{
  "message": "Verification code sent"
}
```

#### Verify Phone
```http
POST /user/profile/phone/verify
Authorization: Bearer <token>
Content-Type: application/json

{
  "verificationCode": "123456"
}
```

## Environment Configuration

### Development Mode (.env.local)
```bash
NODE_ENV=development
LOCAL_STORAGE_PATH=./uploads
MINIO_* variables can be empty (not used)
```

### Production Mode (.env)
```bash
NODE_ENV=production
LOCAL_STORAGE_PATH=./uploads (optional, ignored)

# MinIO Configuration
MINIO_ENDPOINT=minio.example.com
MINIO_PORT=9000
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
MINIO_RAW_BUCKET=raw-uploads
MINIO_MEDIA_BUCKET=media
```

### Migration to Cloudflare R2

To switch from MinIO to Cloudflare R2, update environment variables:

```bash
# Cloudflare R2 Configuration
MINIO_ENDPOINT=<account-id>.r2.cloudflarestorage.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=<r2-access-key>
MINIO_SECRET_KEY=<r2-secret-key>
MINIO_RAW_BUCKET=raw-uploads
MINIO_MEDIA_BUCKET=media
```

**No code changes required** - the S3 API is compatible!

## File Upload Process

### Local Storage (Development)

```
1. User sends file to POST /user/profile/avatar
2. FileStorageService receives file
3. Validates: size (<5MB), mimetype (image/*)
4. Generates unique filename: {timestamp}-{random}.{ext}
5. Creates directory if needed: ./uploads/avatars/
6. Writes file to disk
7. Returns URL: /uploads/avatars/{filename}
8. Profile updated with avatarUrl and avatarStoragePath
9. Old avatar deleted if exists
```

### MinIO Storage (Production)

```
1. User sends file to POST /user/profile/avatar
2. FileStorageService receives file
3. Validates: size (<5MB), mimetype (image/*)
4. Ensures bucket exists: buckets/avatars
5. Uploads to MinIO: PUT /buckets/avatars/{filename}
6. Returns URL: http://minio:9000/avatars/{filename}
7. Profile updated with avatarUrl and avatarStoragePath
8. Old avatar deleted from MinIO if exists
```

## Error Handling

### Common Errors

| Status | Error | Cause |
|--------|-------|-------|
| 400 | Invalid file | File exceeds 5MB or unsupported mimetype |
| 400 | Invalid phone number | Phone number format incorrect |
| 400 | Invalid verification code | Code doesn't match or expired |
| 409 | Username already taken | Duplicate username |
| 409 | NIP already registered | Business with same NIP exists |
| 404 | Profile not found | Profile doesn't exist for user |
| 500 | File upload failed | MinIO/storage error |

## Validation Rules

### Profile Fields
- **firstName**: 1-50 chars
- **lastName**: 1-50 chars
- **username**: 3-30 chars, alphanumeric + underscore/hyphen
- **bio**: 0-500 chars
- **interests**: Max 10 tags, each 50 chars max

### Business Fields
- **businessName**: 2-100 chars
- **nip**: Exactly 10 digits
- **businessDescription**: 0-1000 chars
- **websiteUrl**: Valid URL format

## Development Notes

### Setup

1. Install dependencies:
```bash
pnpm install
```

2. Create `.env.local`:
```bash
cp .env.example .env.local
```

3. Ensure uploads directory exists:
```bash
mkdir -p uploads/avatars uploads/media
```

4. Run migrations:
```bash
pnpm db:push
```

### Testing Endpoints

Use Swagger UI at `http://localhost:4000/api` to test endpoints.

Or use curl:

```bash
# Get profile
curl -H "Authorization: Bearer <token>" \
  http://localhost:4000/user/profile

# Upload avatar
curl -H "Authorization: Bearer <token>" \
  -F "file=@avatar.jpg" \
  http://localhost:4000/user/profile/avatar

# Update profile
curl -X PATCH \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"bio":"New bio"}' \
  http://localhost:4000/user/profile
```

### Debugging

Enable debug logging:
```bash
# In your terminal
DEBUG=* pnpm start:dev
```

Check stored files:
```bash
# Local storage
ls -la ./uploads/avatars/
```

## Future Enhancements

- [ ] Phone verification via SMS service (Twilio)
- [ ] Email verification flow
- [ ] Profile picture cropping/optimization
- [ ] Business verification integration with Polish APIs
- [ ] Social graph (follows/followers)
- [ ] Profile activity feed
- [ ] Profile completion score
- [ ] Profile badges and verifications
- [ ] Bulk profile export
- [ ] Profile privacy controls per field
- [ ] Integration with CDN for image optimization

## Related Files

- **Schema**: `src/shared/infrastructure/database/schema/profiles.ts`
- **Service**: `src/modules/user/services/profile.service.ts`
- **Controller**: `src/modules/user/user.controller.ts`
- **DTOs**: `src/modules/user/dto/profile.dto.ts`
- **Storage**: `src/shared/infrastructure/storage/file-storage.service.ts`
- **Module**: `src/modules/user/user.module.ts`
- **Migration**: `src/shared/infrastructure/database/migrations/0001_enhance_profiles.sql`

## References

- [NestJS File Upload](https://docs.nestjs.com/techniques/file-upload)
- [MinIO Node.js Client](https://min.io/docs/minio/linux/developers/javascript/API.html)
- [S3 API Compatibility](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingAWSSDK.html)
- [Cloudflare R2 Migration](https://developers.cloudflare.com/r2/get-started/)
