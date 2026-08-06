import { Users, Award, Clock } from 'lucide-react';

export function About() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Quiénes Somos</h1>
        <div className="w-24 h-1 bg-blue-600 mx-auto"></div>
      </div>

      <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            Tu Socio en el Éxito Académico
          </h2>
          <p className="text-gray-600 mb-4 leading-relaxed">
            Somos una plataforma líder en la prestación de servicios educativos especializados.
            Nos dedicamos a apoyar a estudiantes en su camino académico, ofreciendo soluciones
            personalizadas para diversas plataformas educativas.
          </p>
          <p className="text-gray-600 mb-4 leading-relaxed">
            Con años de experiencia en el sector educativo, nuestro equipo de profesionales
            comprometidos trabaja incansablemente para garantizar la satisfacción y el éxito
            de nuestros clientes.
          </p>
          <p className="text-gray-600 leading-relaxed">
            Nos especializamos en ALEKS, Cambridge One, Coursera y National Geographic Learning,
            ofreciendo asistencia integral para que puedas alcanzar tus metas académicas.
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-8 text-white">
          <h3 className="text-2xl font-bold mb-6">Nuestros Valores</h3>
          <ul className="space-y-4">
            <li className="flex items-start space-x-3">
              <div className="bg-white/20 rounded-full p-2 mt-1">
                <Award size={20} />
              </div>
              <div>
                <h4 className="font-semibold mb-1">Excelencia</h4>
                <p className="text-blue-100 text-sm">
                  Compromiso con la más alta calidad en cada servicio
                </p>
              </div>
            </li>
            <li className="flex items-start space-x-3">
              <div className="bg-white/20 rounded-full p-2 mt-1">
                <Users size={20} />
              </div>
              <div>
                <h4 className="font-semibold mb-1">Compromiso</h4>
                <p className="text-blue-100 text-sm">
                  Dedicados al éxito de cada estudiante
                </p>
              </div>
            </li>
            <li className="flex items-start space-x-3">
              <div className="bg-white/20 rounded-full p-2 mt-1">
                <Clock size={20} />
              </div>
              <div>
                <h4 className="font-semibold mb-1">Puntualidad</h4>
                <p className="text-blue-100 text-sm">
                  Entrega oportuna y confiable en todos nuestros servicios
                </p>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8 mb-16">
        <div className="text-center p-6 bg-white rounded-lg shadow-md">
          <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <Users className="text-blue-600" size={32} />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">500+</h3>
          <p className="text-gray-600">Estudiantes Satisfechos</p>
        </div>

        <div className="text-center p-6 bg-white rounded-lg shadow-md">
          <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <Award className="text-blue-600" size={32} />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">98%</h3>
          <p className="text-gray-600">Tasa de Satisfacción</p>
        </div>

        <div className="text-center p-6 bg-white rounded-lg shadow-md">
          <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <Clock className="text-blue-600" size={32} />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">24/7</h3>
          <p className="text-gray-600">Soporte Disponible</p>
        </div>
      </div>
    </div>
  );
}
