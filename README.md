# Pocket Trades

A lightweight, mobile-optimized companion app for Pokémon TCG Pocket that helps players find trading partners.

## Features

- **Authentication**: Register, login, and reset password functionality using Supabase authentication
- **Card Browsing**: Browse the full collection of Pokémon TCG Pocket cards with filters and search
- **Trade Management**: See which cards other players need and offer trades
- **Responsive Design**: Works great on both desktop and mobile devices
- **User Feedback**: Notifications for successful trade offers and error handling
- **Robust Error Handling**: Detailed error messages and automatic troubleshooting 

## Tech Stack

- React
- TypeScript
- Tailwind CSS
- Supabase (Authentication & Database)
- React Router

## Getting Started

### Prerequisites

- Node.js (v14+)
- npm or yarn
- Supabase account with database set up

### Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd pokemon-trades
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with your Supabase credentials:
   ```
   REACT_APP_SUPABASE_URL=your_supabase_url
   REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Start the development server:
   ```
   npm start
   ```

5. Open [http://localhost:3000](http://localhost:3000) to view the app in your browser.

## Database Schema

The application uses the following database schema in Supabase:

### Users Table
```sql
create table public.users (
  id uuid not null,
  email text not null,
  name text not null,
  username text not null,
  friend_code text null,
  created_at timestamp with time zone null default now(),
  constraint users_pkey primary key (id),
  constraint users_email_key unique (email),
  constraint users_username_key unique (username),
  constraint users_id_fkey foreign KEY (id) references auth.users (id)
);
```

### Cards Table
```sql
create table public.cards (
  id uuid not null default gen_random_uuid(),
  pack text not null,
  card_number text not null,
  card_name text not null,
  card_type text not null,
  card_rarity text not null,
  tradeable boolean null default true,
  image_url text null,
  card_element text null,
  constraint cards_pkey primary key (id),
  constraint cards_pack_card_number_key unique (pack, card_number)
);
```

### Trades Table
```sql
create table public.trades (
  id serial not null,
  user_id uuid not null,
  card_id uuid not null,
  offered_by uuid null,
  requested_date timestamp with time zone null default now(),
  constraint trades_pkey primary key (id),
  constraint trades_user_id_card_id_key unique (user_id, card_id),
  constraint trades_card_id_fkey foreign KEY (card_id) references cards (id) on delete CASCADE,
  constraint trades_offered_by_fkey foreign KEY (offered_by) references users (id) on delete set null,
  constraint trades_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE
);
```

## UUID Migration

As of version 2.0, the application has migrated card IDs from integers to UUIDs for better scalability and uniqueness. If you're upgrading from a previous version, follow these steps:

1. Backup your database before applying any changes
2. Run the migration script found in `cards_id_to_uuid_migration.sql`
3. Update your application code to use the latest version

For detailed migration instructions, see `uuid_migration_readme.md`.

## Row Level Security (RLS) Policies

The application uses the following RLS policies to secure data in Supabase:

### Trades Table Policies

```sql
-- Allow users to view all trades
CREATE POLICY "trades_select_policy" 
ON "public"."trades"
FOR SELECT 
TO public
USING (true);

-- Allow authenticated users to insert their own trades
CREATE POLICY "trades_insert_policy" 
ON "public"."trades"
FOR INSERT 
TO public
WITH CHECK (auth.uid() = user_id);

-- Allow users to update trades they created or offer trades from others
CREATE POLICY "trades_update_policy" 
ON "public"."trades"
FOR UPDATE
TO public
USING (
  -- Original requester can update their own trades
  (auth.uid() = user_id)
  OR
  -- Anyone can update offered_by when it's currently null (making an offer)
  (
    auth.uid() IS NOT NULL AND 
    offered_by IS NULL AND
    auth.uid() != user_id
  )
)
WITH CHECK (
  -- Original requester can update any columns
  (auth.uid() = user_id)
  OR
  -- Other users can only update the offered_by column and only with their own ID
  (
    auth.uid() IS NOT NULL AND
    auth.uid() != user_id AND
    offered_by = auth.uid()
  )
);

-- Allow users to delete only their own trades
CREATE POLICY "trades_delete_policy" 
ON "public"."trades"
FOR DELETE 
TO public
USING (auth.uid() = user_id);
```

## Auto User Creation

The application automatically creates user records in the `users` table when users interact with the trading system. This ensures that foreign key constraints are respected and helps maintain data integrity.

## Application Structure

- `src/components`: Reusable UI components
- `src/contexts`: React context providers (Auth context)
- `src/lib`: Utility libraries, including Supabase client
- `src/pages`: Main page components
- `src/styles`: Global styles and Tailwind configuration

## Troubleshooting

If you encounter any issues with the trade system, the most common problems are:

1. **User Creation**: Ensure the authenticated user exists in the users table
2. **RLS Policies**: Check that the Row Level Security policies are correctly set up
3. **Foreign Key Constraints**: Make sure all referenced records exist before updates

## License

This project is licensed under the MIT License.

## Deployment

This app is deployed on GitHub Pages with clean URL routing.

Last deployment trigger: March 27, 2025 