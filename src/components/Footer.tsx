export function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-white text-lg font-semibold mb-4">Academy Flow</h3>
            <p className="text-sm">
              Tu plataforma de confianza para servicios educativos de calidad.
            </p>
          </div>

          <div>
            <h3 className="text-white text-lg font-semibold mb-4">Enlaces Rápidos</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#" className="hover:text-white transition">Inicio</a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">Quiénes Somos</a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">Visión</a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition">Misión</a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-white text-lg font-semibold mb-4">Contacto</h3>
            <p className="text-sm">
              Email: info@academyflow.com<br />
              Soporte disponible 24/7
            </p>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} Academy Flow. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
