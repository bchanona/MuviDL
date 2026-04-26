# MuviDL API - Documentación para Android

## Base URL
```
https://muvidl-api.onrender.com/api/v1
```

---

## Endpoints

### 1. Obtener información del media (preview)
```
GET /download/info?url={URL}
```
**Parámetros:**
- `url` (required) - URL del video

**Respuesta:**
```json
{
  "metadata": {
    "id": "video_id",
    "title": "Rick Astley - Never Gonna Give You Up",
    "source": "youtube",
    "type": "video",
    "duration": 213,
    "thumbnail": "https://..."
  },
  "bestFormat": {
    "ext": "mp4",
    "quality": "best"
  }
}
```

---

### 2. Iniciar descarga
```
POST /download
Content-Type: application/json
```
**Body:**
```json
{
  "url": "https://www.youtube.com/watch?v=...",
  "type": "video"
}
```
- `type`: `"video"` (default) o `"audio"`

**Respuesta:**
```json
{
  "id": "uuid-del-download",
  "mediaId": "uuid",
  "url": "https://...",
  "title": "Video Title",
  "source": "youtube",
  "type": "video",
  "status": "downloading",
  "progress": 0,
  "createdAt": "2026-04-26T12:00:00.000Z",
  "updatedAt": "2026-04-26T12:00:00.000Z"
}
```

---

### 3. Consultar estado de descarga
```
GET /download/{id}
```

**Estados posibles:**
- `"pending"` - Descarga iniciada
- `"downloading"` - En proceso (ve `progress`)
- `"completed"` - Listo para descargar
- `"failed"` - Error
- `"cancelled"` - Cancelado

**Respuesta:**
```json
{
  "id": "uuid",
  "status": "completed",
  "progress": 100,
  "filePath": "./downloads/video.mp4"
}
```

---

### 4. Descargar archivo (Streaming)
```
GET /download/{id}/stream
```

**Descripción:** Retorna el archivo de video/audio directamente.

**Uso en Android:**
```kotlin
// Retrofit
@GET("api/v1/download/{id}/stream")
@Streaming
fun downloadFile(@Path("id") id: String): Call<ResponseBody>
```

**Ejemplo de descarga:**
```kotlin
val call = api.downloadFile(downloadId)
call.enqueue(object : Callback<ResponseBody> {
    override fun onResponse(call: Call<ResponseBody>, response: Response<ResponseBody>) {
        if (response.isSuccessful) {
            val body = response.body()
            // Guardar archivo
            body?.let { saveToFile(it.byteStream(), "video.mp4") }
        }
    }
})
```

---

### 5. Cancelar descarga
```
DELETE /download/{id}
```

---

### 6. Listar fuentes soportadas
```
GET /sources
```
**Respuesta:**
```json
{"sources": ["YouTube", "Facebook", "Instagram", "TikTok"]}
```

---

## Códigos de Error

| Código | Significado |
|--------|-------------|
| 400 | Error en la petición |
| 404 | No encontrado |
| 500 | Error interno |

**Errores comunes:**
- `"YouTube blocked..."` - YouTube detectó bot
- `"Video unavailable..."` - Video eliminado/privado
- `"Unsupported platform"` - Plataforma no soportada
- `"Download not ready"` - Descarga aún en proceso

---

## Flujo Completo para Android

### Paso 1: Obtener Info
```kotlin
val infoResponse = api.getMediaInfo(url).execute()
val info = infoResponse.body()
```

### Paso 2: Iniciar Descarga
```kotlin
val downloadRequest = api.startDownload(url, "video").execute()
val download = downloadResponse.body()
val downloadId = download?.id
```

### Paso 3: Polling de estado
```kotlin
while (true) {
    val statusResponse = api.getDownloadStatus(downloadId).execute()
    val status = statusResponse.body()
    
    when (status?.status) {
        "completed" -> break
        "failed" -> throw Exception("Download failed")
        else -> Thread.sleep(2000) // Esperar 2 segundos
    }
}
```

### Paso 4: Descargar archivo
```kotlin
val fileResponse = api.downloadFile(downloadId).execute()
if (fileResponse.isSuccessful) {
    val inputStream = fileResponse.body()?.byteStream()
    // Guardar en storage
    saveToStorage(inputStream, "video.mp4")
}
```

---

## Configuración Android

### build.gradle
```kotlin
dependencies {
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
}
```

### ApiService.kt
```kotlin
interface MuviDLApi {
    @GET("api/v1/sources")
    suspend fun getSources(): Response<SourcesResponse>

    @GET("api/v1/download/info")
    suspend fun getMediaInfo(@Query("url") url: String): Response<MediaInfoResponse>

    @POST("api/v1/download")
    suspend fun startDownload(@Body request: DownloadRequest): Response<DownloadTaskResponse>

    @GET("api/v1/download/{id}")
    suspend fun getDownloadStatus(@Path("id") id: String): Response<DownloadTaskResponse>

    @GET("api/v1/download/{id}/stream")
    @Streaming
    suspend fun downloadFile(@Path("id") id: String): Response<ResponseBody>

    @DELETE("api/v1/download/{id}")
    suspend fun cancelDownload(@Path("id") id: String): Response<MessageResponse>
}
```

### NetworkModule.kt (Hilt)
```kotlin
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    fun provideRetrofit(): Retrofit {
        return Retrofit.Builder()
            .baseUrl("https://muvidl-api.onrender.com/api/v1/")
            .client(OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .writeTimeout(60, TimeUnit.SECONDS)
                .build())
            .build()
    }

    @Provides
    fun provideApi(retrofit: Retrofit): MuviDLApi {
        return retrofit.create(MuviDLApi::class.java)
    }
}
```

---

## Permisos Android (AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- Para guardar archivos -->
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" 
    android:maxSdkVersion="28" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
    android:maxSdkVersion="32" />
    
<!-- Android 13+ -->
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />

<!-- Solicitar en runtime -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

---

## Notas Importantes

1. **Timeout recommendado:** 60-90 segundos para descargas grandes
2. **Progreso:** Usar polling cada 2-3 segundos
3. **Retry:** Implementar retry automático con backoff exponencial
4. **Errores comunes:** Manejar errores de red y errores de YouTube

---

## Ejemplo Completo de Descarga

```kotlin
suspend fun downloadVideo(url: String): File {
    // 1. Obtener info
    val info = api.getMediaInfo(url).body()
    
    // 2. Iniciar descarga
    val download = api.startDownload(url, "video").body()
    val downloadId = download?.id ?: throw Exception("Failed to start download")
    
    // 3. Esperar a queComplete
    while (true) {
        val status = api.getDownloadStatus(downloadId).body()
        when (status?.status) {
            "completed" -> break
            "failed" -> throw Exception(status.error ?: "Download failed")
            else -> delay(2000)
        }
    }
    
    // 4. Descargar archivo
    val response = api.downloadFile(downloadId)
    val body = response.body() ?: throw Exception("Empty response")
    
    // 5. Guardar archivo
    val file = File(context.getExternalFilesDir(null), "${downloadId}.mp4")
    body.byteStream().use { input ->
        file.outputStream().use { output ->
            input.copyTo(output)
        }
    }
    
    return file
}
```