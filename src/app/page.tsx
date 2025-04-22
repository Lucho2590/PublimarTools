"use client";

import Link from "next/link";
import { Button } from "~/components/ui/button";
import Image from "next/image";
import { useEffect } from "react";

export default function Home() {
  // Smooth scroll function for navigation
  const scrollToSection = (id: string) => {
    const element = document.querySelector(id);
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-800">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-sm shadow-sm sticky top-0 z-50 py-4">
        <div className="container mx-auto flex justify-between items-center px-4">
          <div className="flex items-center space-x-2 group">
            {/* Logo */}
            <div className="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center text-white font-bold text-xl transition-transform group-hover:scale-110 duration-300">
              P
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Publimar</h1>
          </div>

          <nav className="hidden md:flex items-center space-x-6">
            <a
              href="#inicio"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection("#inicio");
              }}
              className="font-medium text-gray-700 hover:text-gray-900 transition-all relative after:absolute after:w-0 after:h-0.5 after:bg-gray-900 after:bottom-0 after:left-0 hover:after:w-full after:transition-all"
            >
              INICIO
            </a>
            <a
              href="#empresa"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection("#empresa");
              }}
              className="font-medium text-gray-700 hover:text-gray-900 transition-all relative after:absolute after:w-0 after:h-0.5 after:bg-gray-900 after:bottom-0 after:left-0 hover:after:w-full after:transition-all"
            >
              EMPRESA
            </a>
            <a
              href="#cobertura"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection("#cobertura");
              }}
              className="font-medium text-gray-700 hover:text-gray-900 transition-all relative after:absolute after:w-0 after:h-0.5 after:bg-gray-900 after:bottom-0 after:left-0 hover:after:w-full after:transition-all"
            >
              COBERTURA
            </a>
            <a
              href="#soportes"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection("#soportes");
              }}
              className="font-medium text-gray-700 hover:text-gray-900 transition-all relative after:absolute after:w-0 after:h-0.5 after:bg-gray-900 after:bottom-0 after:left-0 hover:after:w-full after:transition-all"
            >
              SOPORTES
            </a>
            <Link
              href="/contacto"
              className="font-medium text-gray-700 hover:text-gray-900 transition-all relative after:absolute after:w-0 after:h-0.5 after:bg-gray-900 after:bottom-0 after:left-0 hover:after:w-full after:transition-all"
            >
              CONTACTO
            </Link>
            <Link href="/login">
              <Button
                variant="default"
                className="bg-gray-900 hover:bg-gray-800 text-white font-medium transition-transform hover:scale-105"
              >
                Acceso clientes
              </Button>
            </Link>
          </nav>

          <button className="md:hidden text-gray-700">
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
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Hero section */}
      <section
        id="inicio"
        className="relative min-h-[90vh] overflow-hidden flex items-center"
      >
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-white via-gray-50 to-white"></div>
          <div className="absolute top-20 -right-40 w-96 h-96 bg-gray-200 rounded-full opacity-20 blur-3xl"></div>
          <div className="absolute bottom-20 -left-20 w-80 h-80 bg-gray-300 rounded-full opacity-20 blur-3xl"></div>
        </div>

        <div className="container mx-auto px-4 py-20">
          <div className="flex flex-col md:flex-row items-center justify-between gap-12">
            <div className="max-w-xl" data-aos="fade-up">
              <div className="inline-block mb-6 px-3 py-1 border border-gray-300 rounded-full text-sm font-medium bg-white shadow-sm">
                Con más de 50 años en el mercado
              </div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
                Especialistas en{" "}
                <span className="relative inline-block">
                  <span className="relative z-10">banderas</span>
                  <span className="absolute inset-x-0 bottom-2 h-3 bg-yellow-200 -z-10 skew-x-3"></span>
                </span>{" "}
                nacionales y personalizadas
              </h2>
              <p className="text-xl mb-10 text-gray-600">
                Fabricamos banderas de la más alta calidad para empresas,
                instituciones y particulares con atención personalizada.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/contacto">
                  <Button
                    size="lg"
                    className="bg-gray-900 hover:bg-gray-800 text-white shadow-xl transition-all hover:translate-y-[-2px]"
                  >
                    Solicitar presupuesto
                  </Button>
                </Link>
                <a
                  href="#productos"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("#productos");
                  }}
                >
                  <Button
                    variant="outline"
                    size="lg"
                    className="border-gray-300 text-gray-800 hover:bg-gray-50 transition-all hover:translate-y-[-2px]"
                  >
                    Ver catálogo
                  </Button>
                </a>
              </div>
            </div>

            <div
              className="relative w-full max-w-md aspect-square"
              data-aos="fade-left"
              data-aos-delay="200"
            >
              <div className="absolute inset-0 bg-gray-200 rounded-xl animate-pulse opacity-70"></div>
              <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                Imagen de banderas
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trusted by section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <p
            className="text-center text-gray-500 mb-8 text-sm font-medium uppercase tracking-wider"
            data-aos="fade-up"
          >
            Confían en nosotros
          </p>
          <div
            className="flex flex-wrap justify-center gap-8 md:gap-16"
            data-aos="fade-up"
            data-aos-delay="100"
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="w-32 h-12 bg-gray-100 rounded-lg flex items-center justify-center transition-all hover:shadow-md hover:scale-105 hover:bg-gray-50"
              >
                Logo {i}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Empresa section */}
      <section id="empresa" className="py-24 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div
              className="relative w-full max-w-md aspect-square rounded-xl overflow-hidden"
              data-aos="fade-right"
            >
              <div className="absolute inset-0 bg-gray-200"></div>
              <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                Imagen de empresa
              </div>
            </div>

            <div className="max-w-xl" data-aos="fade-left">
              <h2 className="text-3xl font-bold mb-6 text-gray-900">
                Nuestra Empresa
              </h2>
              <p className="text-gray-600 mb-4">
                Con más de 50 años en el mercado, Publimar se ha convertido en
                líder en la fabricación y venta de banderas nacionales e
                institucionales.
              </p>
              <p className="text-gray-600 mb-6">
                Contamos con tecnología de última generación y un equipo de
                profesionales comprometidos con ofrecer productos de la más alta
                calidad.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-2xl font-bold text-gray-900">50+</div>
                  <div className="text-gray-600">Años de experiencia</div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-2xl font-bold text-gray-900">1000+</div>
                  <div className="text-gray-600">Clientes satisfechos</div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-2xl font-bold text-gray-900">200+</div>
                  <div className="text-gray-600">Modelos disponibles</div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-2xl font-bold text-gray-900">15+</div>
                  <div className="text-gray-600">Profesionales</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Products section */}
      <section id="productos" className="py-24 bg-white">
        <div className="container mx-auto px-4">
          <div
            className="max-w-xl mx-auto text-center mb-16"
            data-aos="fade-up"
          >
            <h2 className="text-3xl font-bold mb-4 text-gray-900">
              Nuestros Productos
            </h2>
            <p className="text-gray-600">
              Ofrecemos una amplia variedad de banderas y productos
              relacionados, fabricados con los mejores materiales y técnicas de
              impresión.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              {
                title: "Banderas Nacionales",
                description:
                  "Amplia variedad de banderas de todos los países, en diferentes tamaños y materiales de alta calidad.",
                link: "#productos",
              },
              {
                title: "Banderas Personalizadas",
                description:
                  "Diseñamos y fabricamos banderas personalizadas con tu logo o diseño, con acabados profesionales.",
                link: "#productos",
              },
              {
                title: "Accesorios",
                description:
                  "Mástiles, soportes y todo lo necesario para la instalación y mantenimiento de tus banderas.",
                link: "#productos",
              },
            ].map((product, i) => (
              <div
                key={i}
                className="bg-white rounded-xl overflow-hidden transition-all duration-300 hover:shadow-xl group border border-gray-100"
                data-aos="fade-up"
                data-aos-delay={i * 100}
              >
                <div className="h-48 bg-gray-100 relative overflow-hidden">
                  <div className="absolute inset-0 flex items-center justify-center text-gray-400 group-hover:scale-110 transition-transform duration-500">
                    Imagen {product.title}
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold mb-3 text-gray-900">
                    {product.title}
                  </h3>
                  <p className="text-gray-600 mb-4">{product.description}</p>
                  <a
                    href={product.link}
                    className="text-gray-900 font-medium group-hover:text-gray-700 inline-flex items-center transition-all relative after:absolute after:w-0 after:h-0.5 after:bg-gray-900 after:bottom-0 after:left-0 group-hover:after:w-full after:transition-all"
                  >
                    Ver detalles
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cobertura section */}
      <section id="cobertura" className="py-24 bg-gray-50">
        <div className="container mx-auto px-4">
          <div
            className="max-w-xl mx-auto text-center mb-16"
            data-aos="fade-up"
          >
            <h2 className="text-3xl font-bold mb-4 text-gray-900">
              Nuestra Cobertura
            </h2>
            <p className="text-gray-600">
              Atendemos a clientes en toda la República Argentina con envíos
              rápidos y seguros.
            </p>
          </div>

          <div
            className="relative w-full max-w-3xl mx-auto aspect-video rounded-xl overflow-hidden"
            data-aos="zoom-in"
          >
            <div className="absolute inset-0 bg-gray-200"></div>
            <div className="absolute inset-0 flex items-center justify-center text-gray-500">
              Mapa de cobertura
            </div>
          </div>
        </div>
      </section>

      {/* Soportes section */}
      <section id="soportes" className="py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row-reverse items-center gap-12">
            <div
              className="relative w-full max-w-md aspect-square rounded-xl overflow-hidden"
              data-aos="fade-left"
            >
              <div className="absolute inset-0 bg-gray-200"></div>
              <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                Imagen de soportes
              </div>
            </div>

            <div className="max-w-xl" data-aos="fade-right">
              <h2 className="text-3xl font-bold mb-6 text-gray-900">
                Soportes Publicitarios
              </h2>
              <p className="text-gray-600 mb-4">
                Ofrecemos una amplia variedad de soportes publicitarios para la
                exhibición de banderas y elementos de comunicación visual.
              </p>
              <ul className="space-y-3 mb-6">
                {[
                  "Mástiles",
                  "Bases",
                  "Soportes de pared",
                  "Displays",
                  "Estructuras personalizadas",
                ].map((item, i) => (
                  <li key={i} className="flex items-start">
                    <svg
                      className="h-5 w-5 text-gray-900 mt-0.5 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-gray-600">{item}</span>
                  </li>
                ))}
              </ul>
              <a
                href="#contacto"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("#contacto");
                }}
                className="inline-flex items-center text-gray-900 font-medium hover:text-gray-700 relative after:absolute after:w-0 after:h-0.5 after:bg-gray-900 after:bottom-0 after:left-0 hover:after:w-full after:transition-all"
              >
                Solicitar información
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Call to action */}
      <section id="contacto" className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div
            className="max-w-4xl mx-auto bg-gray-900 rounded-2xl overflow-hidden shadow-xl transform transition-all hover:scale-[1.01]"
            data-aos="fade-up"
          >
            <div className="p-8 md:p-12 flex flex-col md:flex-row items-center justify-between">
              <div className="mb-8 md:mb-0 md:mr-8">
                <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
                  ¿Necesita un presupuesto?
                </h3>
                <p className="text-gray-300 mb-0">
                  Contáctenos para una consulta personalizada y sin compromiso
                </p>
              </div>
              <Link href="/contacto">
                <Button
                  size="lg"
                  className="whitespace-nowrap bg-white text-gray-900 hover:bg-gray-100 transition-all hover:shadow-lg hover:translate-y-[-2px]"
                >
                  Contactar ahora
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white pt-16 pb-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            <div className="md:col-span-1">
              <div className="flex items-center space-x-2 mb-6 group">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-gray-900 font-bold text-xl group-hover:scale-110 transition-transform duration-300">
                  P
                </div>
                <h3 className="text-xl font-bold">Publimar</h3>
              </div>
              <p className="text-gray-400 mb-6">
                Dedicados a la publicidad en la vía pública con 50 años de
                experiencia en Mar del Plata.
              </p>
              <div className="flex space-x-4">
                {["facebook", "instagram", "whatsapp"].map((social, i) => (
                  <a
                    key={i}
                    href="#"
                    className="text-gray-400 hover:text-white transition-colors hover:scale-110 transform inline-block"
                    aria-label={social}
                  >
                    <svg
                      className="h-6 w-6"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold mb-6">Contacto</h3>
              <address className="text-gray-400 not-italic space-y-3">
                <p className="flex items-start">
                  <svg
                    className="h-5 w-5 mr-2 text-gray-300 flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  San Lorenzo 3145, Mar del Plata
                </p>
                <p className="flex items-start">
                  <svg
                    className="h-5 w-5 mr-2 text-gray-300 flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    />
                  </svg>
                  223 - 473 9600 Rot.
                </p>
                <p className="flex items-start">
                  <svg
                    className="h-5 w-5 mr-2 text-gray-300 flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  publimar@publimar.com.ar
                </p>
              </address>
            </div>

            <div>
              <h3 className="text-lg font-bold mb-6">Navegación</h3>
              <nav className="flex flex-col space-y-3">
                {[
                  { name: "Inicio", href: "#inicio" },
                  { name: "Empresa", href: "#empresa" },
                  { name: "Productos", href: "#productos" },
                  { name: "Cobertura", href: "#cobertura" },
                  { name: "Soportes", href: "#soportes" },
                ].map((item, i) => (
                  <a
                    key={i}
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToSection(item.href);
                    }}
                    className="text-gray-400 hover:text-white transition-colors group flex items-center"
                  >
                    <svg
                      className="h-4 w-4 mr-2 group-hover:translate-x-1 transition-transform"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    {item.name}
                  </a>
                ))}
                <Link
                  href="/contacto"
                  className="text-gray-400 hover:text-white transition-colors group flex items-center"
                >
                  <svg
                    className="h-4 w-4 mr-2 group-hover:translate-x-1 transition-transform"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  Contacto
                </Link>
              </nav>
            </div>

            <div>
              <h3 className="text-lg font-bold mb-6">Horario de Atención</h3>
              <div className="text-gray-400 space-y-3">
                <p className="flex justify-between">
                  <span>Lunes - Viernes:</span>
                  <span>9:00 - 18:00</span>
                </p>
                <p className="flex justify-between">
                  <span>Sábados:</span>
                  <span>9:00 - 13:00</span>
                </p>
                <p className="flex justify-between">
                  <span>Domingos:</span>
                  <span>Cerrado</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto mt-8 pt-8 border-t border-gray-800 px-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-500 mb-4 md:mb-0">
              © {new Date().getFullYear()} Publimar Mar del Plata - Todos los
              derechos reservados
            </p>
            <div className="flex space-x-6 text-sm">
              <Link
                href="/terminos"
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                Términos y condiciones
              </Link>
              <Link
                href="/privacidad"
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                Política de privacidad
              </Link>
            </div>
          </div>
        </div>
      </footer>

      {/* AOS animation script */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
          document.addEventListener('DOMContentLoaded', function() {
            AOS.init({
              duration: 800,
              easing: 'ease-out',
              once: true
            });
          });
        `,
        }}
      />
    </div>
  );
}
