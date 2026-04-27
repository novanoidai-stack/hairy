-- Insertar profesionales
INSERT INTO profesionales (negocio_id, nombre, color, rol, activo) VALUES
('prueba_46980', 'Carla', '#8b5cf6', 'Estilista Senior', true),
('prueba_46980', 'Diego', '#10b981', 'Barbero', true),
('prueba_46980', 'Sofía', '#f59e0b', 'Colorista', true),
('prueba_46980', 'Marco', '#06b6d4', 'Barbero Junior', true)
ON CONFLICT DO NOTHING;

-- Insertar servicios
INSERT INTO servicios (negocio_id, nombre, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min, precio) VALUES
('prueba_46980', 'Corte de cabello', 30, 10, 0, 25),
('prueba_46980', 'Tinte', 60, 40, 20, 65),
('prueba_46980', 'Barba', 20, 5, 0, 15),
('prueba_46980', 'Manicura', 45, 0, 0, 35),
('prueba_46980', 'Tratamiento capilar', 50, 30, 10, 55)
ON CONFLICT DO NOTHING;

-- Insertar clientes
INSERT INTO clientes (negocio_id, nombre, telefono) VALUES
('prueba_46980', 'María Rodríguez', '+34 666 111 111'),
('prueba_46980', 'Juan García', '+34 666 222 222'),
('prueba_46980', 'Ana Martínez', '+34 666 333 333'),
('prueba_46980', 'Carlos López', '+34 666 444 444'),
('prueba_46980', 'Elena Sánchez', '+34 666 555 555'),
('prueba_46980', 'David Fernández', '+34 666 666 666'),
('prueba_46980', 'Carmen Vázquez', '+34 666 777 777'),
('prueba_46980', 'Lucía Pérez', '+34 666 888 888')
ON CONFLICT DO NOTHING;
