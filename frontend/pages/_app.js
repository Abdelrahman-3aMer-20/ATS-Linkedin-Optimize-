import '../styles/globals.css';
 
import { AuthProvider } from '../contexts/AuthContext'; 
import { Toaster } from 'react-hot-toast'; 

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Toaster position="top-right" reverseOrder={false} />
      <Component {...pageProps} />
    </AuthProvider>
  );
}

export default MyApp;
