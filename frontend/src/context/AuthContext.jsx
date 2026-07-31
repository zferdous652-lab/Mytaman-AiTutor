import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const AuthCtx = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = sessionStorage.getItem("mytaman_token");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (e) {
      sessionStorage.removeItem("mytaman_token");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // `identifier` is an email for parents/admins and a student ID for children.
  const login = async (identifier, password) => {
    const { data } = await api.post("/auth/login", { identifier, password });
    sessionStorage.setItem("mytaman_token", data.token);
    setUser(data.user);
    return data.user;
  };
  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    sessionStorage.setItem("mytaman_token", data.token);
    setUser(data.user);
    return data.user;
  };
  // For flows that get a token back from an endpoint other than login/register --
  // e.g. student self-registration, which signs the student straight in.
  const setSession = useCallback((token, u) => {
    sessionStorage.setItem("mytaman_token", token);
    setUser(u);
  }, []);
  const logout = () => {
    sessionStorage.removeItem("mytaman_token");
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout, setSession, refresh: load }}>
      {children}
    </AuthCtx.Provider>
  );
};

export const useAuth = () => useContext(AuthCtx);
