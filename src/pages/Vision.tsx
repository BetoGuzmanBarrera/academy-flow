import { Eye, Target, TrendingUp, Globe } from 'lucide-react';

export function Vision() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Nuestra Visión</h1>
        <div className="w-24 h-1 bg-blue-600 mx-auto"></div>
      </div>

      <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-12 text-white mb-16">
        <div className="flex items-center justify-center mb-8">
          <div className="bg-white/20 rounded-full p-4">
            <Eye size={48} />
          </div>
        </div>

        <p className="text-2xl md:text-3xl text-center leading-relaxed mb-8">
          Ser la plataforma líder en servicios educativos digitales, transformando la manera
          en que los estudiantes abordan sus desafíos académicos y alcanzando la excelencia
          educativa a nivel global.
        </p>

        <p className="text-xl text-center text-blue-100">
          Aspiramos a ser reconocidos por nuestra innovación, calidad y compromiso
          inquebrantable con el éxito estudiantil.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="bg-white p-8 rounded-lg shadow-lg border-t-4 border-blue-600">
          <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mb-6">
            <Target className="text-blue-600" size={32} />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">Liderazgo</h3>
          <p className="text-gray-600 leading-relaxed">
            Establecernos como la primera opción para estudiantes que buscan apoyo académico
            de calidad en plataformas educativas digitales.
          </p>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-lg border-t-4 border-blue-600">
          <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mb-6">
            <TrendingUp className="text-blue-600" size={32} />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">Innovación</h3>
          <p className="text-gray-600 leading-relaxed">
            Implementar constantemente nuevas tecnologías y metodologías para mejorar
            la experiencia educativa de nuestros usuarios.
          </p>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-lg border-t-4 border-blue-600">
          <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mb-6">
            <Globe className="text-blue-600" size={32} />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-4">Alcance Global</h3>
          <p className="text-gray-600 leading-relaxed">
            Expandir nuestros servicios para llegar a estudiantes de todo el mundo,
            eliminando barreras geográficas en la educación.
          </p>
        </div>
      </div>

      <div className="mt-16 bg-gray-50 rounded-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          Objetivos Estratégicos
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="flex items-start space-x-4">
            <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 mt-1">
              1
            </div>
            <p className="text-gray-700">
              Ampliar nuestra oferta de servicios para cubrir más plataformas educativas
            </p>
          </div>
          <div className="flex items-start space-x-4">
            <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 mt-1">
              2
            </div>
            <p className="text-gray-700">
              Mantener una tasa de satisfacción superior al 95%
            </p>
          </div>
          <div className="flex items-start space-x-4">
            <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 mt-1">
              3
            </div>
            <p className="text-gray-700">
              Desarrollar alianzas estratégicas con instituciones educativas
            </p>
          </div>
          <div className="flex items-start space-x-4">
            <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 mt-1">
              4
            </div>
            <p className="text-gray-700">
              Implementar tecnologías de inteligencia artificial para mejorar nuestros servicios
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
