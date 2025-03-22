/**
 * This is a test file to verify environment variables are loading correctly
 * Run this in the browser console or in your app to debug
 */

export const testEnvVariables = () => {
  console.log('Environment Variables Test:');
  console.log('-------------------------');
  console.log('VITE_HOST:', import.meta.env.VITE_HOST);
  console.log('VITE_PORT:', import.meta.env.VITE_PORT);
  console.log('VITE_BACKEND_PORT:', import.meta.env.VITE_BACKEND_PORT);
  console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);
  console.log('VITE_TOKEN_KEY:', import.meta.env.VITE_TOKEN_KEY);
  console.log('-------------------------');
  
  return {
    VITE_HOST: import.meta.env.VITE_HOST,
    VITE_PORT: import.meta.env.VITE_PORT,
    VITE_BACKEND_PORT: import.meta.env.VITE_BACKEND_PORT,
    VITE_API_URL: import.meta.env.VITE_API_URL,
    VITE_TOKEN_KEY: import.meta.env.VITE_TOKEN_KEY
  };
};

// You can add this to your main.jsx file to run on startup
// import { testEnvVariables } from './utils/envTest';
// testEnvVariables(); 