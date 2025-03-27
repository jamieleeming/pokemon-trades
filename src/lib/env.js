// Environment variables with hardcoded fallbacks for GitHub Pages
const env = {
  SUPABASE_URL: process.env.REACT_APP_SUPABASE_URL || 'https://gtiopunyvvmgojspkcwu.supabase.co',
  SUPABASE_ANON_KEY: process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0aW9wdW55dnZtZ29qc3BrY3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI3Nzk3OTIsImV4cCI6MjA1ODM1NTc5Mn0.5F3ukenRMVybvD48nx9qG35FlpniYlmdnUjE01LkJ-I',
};

// Log environment status for debugging
console.log('Environment variables status:');
Object.keys(env).forEach(key => {
  const value = env[key];
  console.log(`- ${key}: ${value ? '[Available]' : '[Missing]'}`);
});

export default env; 