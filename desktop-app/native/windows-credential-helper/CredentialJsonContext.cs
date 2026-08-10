using System.Text.Json.Serialization;

namespace MdEditor.WindowsCredentialHelper;

/// <summary>Provides trim-safe JSON metadata for the helper's bounded protocol.</summary>
[JsonSourceGenerationOptions(PropertyNameCaseInsensitive = true)]
[JsonSerializable(typeof(CredentialCommand))]
[JsonSerializable(typeof(CredentialResponse))]
internal partial class CredentialJsonContext : JsonSerializerContext
{
}
