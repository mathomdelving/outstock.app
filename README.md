# Inventory App

A cross-platform inventory management app for traveling political campaigns, band merch vendors, and farmers market vendors.

## Tech Stack

- **Frontend**: React Native + Expo (iOS, Android, Web)
- **Backend**: Supabase (Auth, Database, Real-time)
- **Routing**: Expo Router (file-based)
- **Styling**: React Native StyleSheet

## Features

- **Role-based access**: Admin and User roles with different permissions
- **Real-time inventory**: Live updates across devices
- **Location tracking**: Log where items are sold/given away
- **Dynamic fields**: Customizable item fields per organization
- **Multi-tenant**: Support for multiple organizations

## Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the project to be provisioned

### 2. Run Database Migrations

In your Supabase dashboard, go to **SQL Editor** and run each migration file in order:

1. `supabase/migrations/001_organizations.sql`
2. `supabase/migrations/002_user_profiles.sql`
3. `supabase/migrations/003_field_definitions.sql`
4. `supabase/migrations/004_inventory_items.sql`
5. `supabase/migrations/005_item_assignments.sql`
6. `supabase/migrations/006_location_history.sql`
7. `supabase/migrations/007_functions_triggers.sql`

### 3. Configure Environment Variables

Copy `.env.example` to `.env` and add your Supabase credentials:

```bash
cp .env.example .env
```

Then edit `.env`:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Find these values in your Supabase dashboard under **Settings > API**.

### 4. Install Dependencies

```bash
npm install
```

### 5. Run the App

```bash
# Start the development server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android

# Run on web
npm run web
```

## Project Structure

```
inventory-app/
├── app/                    # Expo Router screens
│   ├── (auth)/            # Authentication screens
│   ├── (app)/             # Main app screens (protected)
│   │   ├── (tabs)/        # Tab navigation
│   │   ├── (admin)/       # Admin-only screens
│   │   └── item/          # Item detail
│   └── _layout.tsx        # Root layout
├── src/
│   ├── components/        # Reusable components
│   ├── contexts/          # React contexts (Auth)
│   ├── hooks/             # Custom hooks
│   ├── lib/               # Core libraries (Supabase)
│   ├── services/          # Business logic
│   ├── types/             # TypeScript types
│   └── utils/             # Utility functions
└── supabase/
    └── migrations/        # Database schema
```

## User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full CRUD on all inventory, manage users, assign items |
| **User** | View/update only items assigned by admin |

## Default Categories

- Apparel (T-shirts, hats)
- Signs (Yard signs, banners)
- Promotional (Buttons, stickers)
- Literature (Flyers, brochures)
- Accessories (Lanyards, bags)

## License

Private
