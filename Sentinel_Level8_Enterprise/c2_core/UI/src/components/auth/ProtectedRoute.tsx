import { Navigate, Outlet } from "react-router-dom";

interface ProtectedRouteProps {
    allowedRoles?: string[];
}

const ProtectedRoute = ({ allowedRoles }: ProtectedRouteProps) => {
    const token = localStorage.getItem("sentinel_token");
    const userRole = localStorage.getItem("sentinel_role");

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
        // Optional: Redirect to a "Not Authorized" page or just home
        // For now, redirect to dashboard home which they might have read access to,
        // or if they are totally blocked, back to login.
        // If we are wrapping specific admin routes, we redirect to dashboard root.
        return <Navigate to="/dashboard" replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
