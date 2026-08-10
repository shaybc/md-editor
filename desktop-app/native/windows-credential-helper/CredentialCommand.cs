using System.Text.Json.Serialization;

namespace MdEditor.WindowsCredentialHelper;

/// <summary>One bounded request received from the trusted AI Companion bridge.</summary>
internal sealed class CredentialCommand
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("action")]
    public string Action { get; init; } = string.Empty;

    [JsonPropertyName("credentialId")]
    public string CredentialId { get; init; } = string.Empty;

    [JsonPropertyName("secret")]
    public string Secret { get; init; } = string.Empty;
}

/// <summary>Sanitized response written to the bridge's private stdout pipe.</summary>
internal sealed record CredentialResponse(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("ok")] bool Ok,
    [property: JsonPropertyName("credentialId")] string? CredentialId = null,
    [property: JsonPropertyName("secret")] string? Secret = null,
    [property: JsonPropertyName("exists")] bool? Exists = null,
    [property: JsonPropertyName("deleted")] bool? Deleted = null,
    [property: JsonPropertyName("errorCode")] string? ErrorCode = null);

/// <summary>Represents a stable, non-sensitive failure returned to the bridge.</summary>
internal sealed class CredentialStoreException(string code) : Exception(code)
{
    public string Code { get; } = code;
}
