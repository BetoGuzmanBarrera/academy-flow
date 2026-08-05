import { FileText, Clock, DollarSign, Calendar, AlertCircle } from 'lucide-react';

export function Policies() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Políticas de Servicio</h1>
        <div className="w-24 h-1 bg-blue-600 mx-auto mb-6"></div>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
          Nuestro compromiso es brindarte un servicio claro, responsable y bien organizado. Para asegurar una buena comunicación y evitar malentendidos, es importante que leas atentamente todas las políticas antes de solicitar cualquier trabajo o examen. Estas reglas existen para proteger tu inversión, garantizar orden en la agenda y asegurar que cada solicitud se realice con la calidad y el tiempo necesarios.
        </p>
        <p className="text-gray-700 mt-4 font-medium">
          Al continuar con el servicio, confirmas que estás de acuerdo con estas condiciones y que las entiendes completamente.
        </p>
      </div>

      <div className="space-y-8 mb-16">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-start space-x-4 mb-6">
            <div className="bg-blue-100 rounded-full p-3">
              <FileText className="text-blue-600" size={28} />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900">EXÁMENES</h2>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                <Clock size={20} className="text-blue-600" />
                <span>1.1. Anticipación obligatoria</span>
              </h3>
              <p className="text-gray-700 leading-relaxed ml-7">
                Los exámenes deben solicitarse con al menos <strong>24 horas de anticipación</strong>.
              </p>
              <p className="text-gray-700 leading-relaxed ml-7 mt-2">
                Las solicitudes hechas con menos tiempo pueden no ser aceptadas.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                <DollarSign size={20} className="text-blue-600" />
                <span>1.2. Aumento de precio por urgencia</span>
              </h3>
              <p className="text-gray-700 leading-relaxed ml-7">
                Si el cliente solicita un examen el mismo día, o con poca anticipación, el precio aumenta debido a la disponibilidad limitada y al riesgo de tiempo.
              </p>
              <p className="text-gray-700 leading-relaxed ml-7 mt-2">
                El porcentaje o monto extra se informa al cliente antes de aceptar el servicio.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                <AlertCircle size={20} className="text-blue-600" />
                <span>1.3. Cupo limitado</span>
              </h3>
              <p className="text-gray-700 leading-relaxed ml-7">
                Los exámenes se realizan únicamente según disponibilidad.
              </p>
              <p className="text-gray-700 leading-relaxed ml-7 mt-2">
                Para asegurar un lugar es necesario apartarlo, lo cual se confirma únicamente con el pago inicial indicado.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                <Calendar size={20} className="text-blue-600" />
                <span>1.5. Cambios de horario</span>
              </h3>
              <p className="text-gray-700 leading-relaxed ml-7">
                Cambios solicitados por el cliente el mismo día pueden no ser posibles.
              </p>
              <p className="text-gray-700 leading-relaxed ml-7 mt-2">
                Si el cambio ocasiona pérdida del horario reservado, no hay reembolso.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-start space-x-4 mb-6">
            <div className="bg-green-100 rounded-full p-3">
              <FileText className="text-green-600" size={28} />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900">TAREAS Y TRABAJOS</h2>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                2.1. Tiempo de entrega
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Las tareas y trabajos se entregan según el tiempo acordado al momento de hacer la solicitud.
              </p>
              <p className="text-gray-700 leading-relaxed mt-2">
                Si se requiere antes de lo establecido, puede aplicar un costo adicional por urgencia.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                2.2. Información completa
              </h3>
              <p className="text-gray-700 leading-relaxed">
                El cliente debe proporcionar toda la información necesaria: instrucciones, archivos, accesos, etc.
              </p>
              <p className="text-gray-700 leading-relaxed mt-2">
                Si falta información importante, puede afectar el tiempo de entrega o el resultado.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                2.3. Revisiones
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Se permite <strong>una revisión gratuita</strong> si el trabajo no cumple con lo solicitado inicialmente.
              </p>
              <p className="text-gray-700 leading-relaxed mt-2">
                Cambios adicionales o nuevos requisitos no mencionados antes pueden tener un costo extra.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-start space-x-4 mb-6">
            <div className="bg-yellow-100 rounded-full p-3">
              <DollarSign className="text-yellow-600" size={28} />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900">PAGOS Y REEMBOLSOS</h2>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                3.1. Métodos de pago
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Aceptamos pagos mediante tarjeta de débito/crédito y PayPal.
              </p>
              <p className="text-gray-700 leading-relaxed mt-2">
                El pago debe realizarse antes o al momento de solicitar el servicio, según se indique.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                3.2. Reembolsos
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Los reembolsos se consideran únicamente si el servicio no se realizó por causas atribuibles a nosotros.
              </p>
              <p className="text-gray-700 leading-relaxed mt-2">
                No aplican reembolsos por cambios de último momento o información incorrecta proporcionada por el cliente.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                3.3. Precios
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Los precios están claramente indicados para cada servicio.
              </p>
              <p className="text-gray-700 leading-relaxed mt-2">
                Cualquier costo adicional por urgencia o servicios extras se comunica antes de proceder.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-start space-x-4 mb-6">
            <div className="bg-red-100 rounded-full p-3">
              <AlertCircle className="text-red-600" size={28} />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900">RESPONSABILIDAD Y USO</h2>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                4.1. Uso del servicio
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Los servicios ofrecidos son de apoyo académico y deben utilizarse de manera responsable.
              </p>
              <p className="text-gray-700 leading-relaxed mt-2">
                El cliente es responsable del uso que le dé a los materiales o servicios proporcionados.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                4.2. Confidencialidad
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Toda la información proporcionada por el cliente es tratada de forma confidencial.
              </p>
              <p className="text-gray-700 leading-relaxed mt-2">
                No compartimos datos personales, accesos o trabajos con terceros.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                4.3. Garantía de calidad
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Nos esforzamos por entregar trabajos de alta calidad y cumplir con los requisitos solicitados.
              </p>
              <p className="text-gray-700 leading-relaxed mt-2">
                Sin embargo, no garantizamos calificaciones específicas, ya que dependen de múltiples factores.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-8 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          ¿Tienes dudas sobre nuestras políticas?
        </h2>
        <p className="text-gray-700 text-lg mb-6">
          Estamos aquí para ayudarte. Utiliza nuestro chat de soporte si necesitas aclaraciones.
        </p>
        <p className="text-gray-600">
          Al utilizar nuestros servicios, aceptas estas políticas en su totalidad.
        </p>
      </div>
    </div>
  );
}
