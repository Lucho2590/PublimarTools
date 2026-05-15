# Scripts de Migración

## Migración de Departamento en Ventas

### Descripción
Este script agrega el campo `department` con valor `"banderas"` a todas las ventas existentes en Firestore.

### Requisitos Previos

1. **Archivo de credenciales de Firebase**
   - Ve a [Firebase Console](https://console.firebase.google.com/)
   - Selecciona tu proyecto
   - Ve a **Project Settings** (⚙️) > **Service Accounts**
   - Click en **Generate New Private Key**
   - Guarda el archivo como `serviceAccountKey.json` en la raíz del proyecto

2. **Instalar dependencias** (si no las tienes)
   ```bash
   pnpm add firebase-admin
   pnpm add -D ts-node @types/node
   ```

### Cómo Ejecutar

1. Asegúrate de tener el archivo `serviceAccountKey.json` en la raíz del proyecto

2. Ejecuta el script:
   ```bash
   pnpm dlx ts-node scripts/migrateSalesDepartment.ts
   ```

3. El script te mostrará el progreso en tiempo real:
   - ✅ Ventas actualizadas
   - ⏭️ Ventas que ya tenían el campo (omitidas)
   - ❌ Errores (si los hay)

4. Al finalizar verás un resumen con estadísticas

### Importante

⚠️ **Este script debe ejecutarse solo UNA VEZ**

Una vez ejecutado exitosamente, todas las ventas tendrán el campo `department: "banderas"`.

### Seguridad

🔒 **NUNCA subas el archivo `serviceAccountKey.json` a git**

Asegúrate de que esté en `.gitignore`:
```
serviceAccountKey.json
```

### Verificación

Después de ejecutar el script, puedes verificar en Firebase Console que las ventas tienen el campo `department`.

### Problemas Comunes

1. **Error: Cannot find module 'serviceAccountKey.json'**
   - Solución: Descarga el archivo de credenciales de Firebase Console

2. **Error: Permission denied**
   - Solución: Verifica que la cuenta de servicio tenga permisos de lectura/escritura en Firestore

3. **Error: ts-node not found**
   - Solución: Instala ts-node: `pnpm add -D ts-node`
