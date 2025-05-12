"use client";

import React, { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSigninCheck } from "reactfire";
import { Button } from "~/components/ui/button";
import { signOut } from "firebase/auth";
import { useAuth } from "reactfire";
import { useRouter } from "next/navigation";

interface IDashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: IDashboardLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const pathname = usePathname();
  const auth = useAuth();
  const { status, data: signInCheckResult } = useSigninCheck();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const toggleItem = (itemName: string) => {
    setExpandedItems((prev) =>
      prev.includes(itemName)
        ? prev.filter((name) => name !== itemName)
        : [...prev, itemName]
    );
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  if (!mounted || status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen">
        Cargando...
      </div>
    );
  }

  if (!signInCheckResult.signedIn) {
    // Si no está autenticado, podríamos redirigir, pero la protección principal
    // se hará en el middleware de autenticación
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="mb-4">Debes iniciar sesión para acceder a esta sección</p>
        <Button asChild>
          <Link href="/login">Iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  const navItems = [
    {
      name: "publimar",
      href: "/publimar",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
        </svg>
      ),
    },
    {
      name: "Banderas",
      href: "/publimar/banderas",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          className="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5"
          />
        </svg>
      ),
      subItems: [
        {
          name: "Productos",
          href: "/publimar/banderas/productos",
          icon: (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" />
              <path
                fillRule="evenodd"
                d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
            </svg>
          ),
        },
        {
          name: "Clientes",
          href: "/publimar/banderas/clientes",
          icon: (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
          ),
        },
        {
          name: "Presupuestos",
          href: "/publimar/banderas/presupuestos",
          icon: (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                clipRule="evenodd"
              />
            </svg>
          ),
        },
        {
          name: "Ordenes",
          href: "/publimar/banderas/ordenes",
          icon: (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path
                fillRule="evenodd"
                d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                clipRule="evenodd"
              />
            </svg>
          ),
        },
        {
          name: "Ventas",
          href: "/publimar/banderas/ventas",
          icon: (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              className="size-6"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"
              />
            </svg>
          ),
        },
        {
          name: "Compras",
          href: "/publimar/banderas/compras",
          icon: (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              className="size-6"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
              />
            </svg>
          ),
        },
      ],
    },
  ];

  return (
    <div className="flex h-screen bg-blue-100">
      {/* Sidebar */}
      <div
        className={`${
          isSidebarOpen ? "w-64" : "w-20"
        } bg-blue-950 text-white transition-all duration-300 ease-in-out flex flex-col`}
      >
        <div className="p-4 flex items-center justify-between">
          {isSidebarOpen ? (
            <h2 className="text-xl font-bold">PublimarTools</h2>
          ) : (
            <h2 className="text-xl font-bold">PT</h2>
          )}
          <button
            onClick={toggleSidebar}
            className="text-white focus:outline-none"
          >
            {isSidebarOpen ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 5l7 7-7 7M5 5l7 7-7 7"
                />
              </svg>
            )}
          </button>
        </div>

        <nav className="mt-6 flex-1">
          <ul>
            {navItems.map((item) => (
              <li key={item.name} className="px-2 py-1">
                {item.subItems ? (
                  <>
                    <div
                      className={`flex items-center p-2 rounded-md cursor-pointer ${
                        pathname === item.href
                          ? "bg-blue-700 text-white"
                          : "text-blue-300 hover:bg-blue-900 hover:text-white"
                      }`}
                      onClick={() => {
                        toggleItem(item.name);
                        router.push(item.href);
                      }}
                    >
                      {item.icon}
                      {isSidebarOpen && (
                        <>
                          <span className="ml-3" >{item.name}</span>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className={`h-4 w-4 ml-auto transition-transform ${
                              expandedItems.includes(item.name)
                                ? "rotate-180"
                                : ""
                            }`}
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </>
                      )}
                    </div>
                    {isSidebarOpen && expandedItems.includes(item.name) && (
                      <ul className="ml-4 mt-1">
                        {item.subItems?.map((subItem) => (
                          <li key={subItem.name} className="py-1">
                            <Link
                              href={subItem.href}
                              className={`flex items-center p-2 rounded-md ${
                                pathname === subItem.href
                                  ? "bg-blue-700 text-white"
                                  : "text-blue-300 hover:bg-blue-900 hover:text-white"
                              }`}
                              onClick={(e) => {
                                e.preventDefault();
                                router.push(subItem.href);
                              }}
                            >
                              {subItem.icon}
                              <span className="ml-3">{subItem.name}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <Link
                    href={item.href}
                    className={`flex items-center p-2 rounded-md ${
                      pathname === item.href
                        ? "bg-blue-700 text-white"
                        : "text-blue-300 hover:bg-blue-900 hover:text-white"
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      router.push(item.href);
                    }}
                  >
                    {item.icon}
                    {isSidebarOpen && <span className="ml-3">{item.name}</span>}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4">
          <Button
            variant="outline"
            className="w-full justify-start text-white bg-blue-950 hover:bg-blue-900 hover:text-white"
            onClick={handleLogout}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              className="size-6"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15"
              />
            </svg>
            {isSidebarOpen && "Cerrar sesión"}
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm">
          <div className="px-4 py-3 flex items-center justify-between">
            <h1 className="text-xl font-bold"> </h1>
            <div className="flex items-center">
              {status === "success" &&
                signInCheckResult.signedIn &&
                signInCheckResult.user && (
                  <span className="mr-4">{signInCheckResult.user.email}</span>
                )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4">{children}</main>
      </div>
    </div>
  );
}
