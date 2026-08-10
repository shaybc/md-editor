using System.Text.Json;
using MdEditor.WindowsCredentialHelper;

var store = new WindowsCredentialStore();

string? line;
while ((line = Console.ReadLine()) is not null)
{
    CredentialResponse response;
    string requestId = string.Empty;
    try
    {
        if (line.Length > 16_384) throw new CredentialStoreException("REQUEST_TOO_LARGE");
        CredentialCommand command = JsonSerializer.Deserialize(line, CredentialJsonContext.Default.CredentialCommand)
            ?? throw new CredentialStoreException("INVALID_REQUEST");
        requestId = command.Id;
        response = command.Action switch
        {
            "write" => new CredentialResponse(requestId, true, CredentialId: store.Write(command.CredentialId, command.Secret)),
            "read" => new CredentialResponse(requestId, true, Secret: store.Read(command.CredentialId)),
            "exists" => new CredentialResponse(requestId, true, Exists: store.Exists(command.CredentialId)),
            "delete" => new CredentialResponse(requestId, true, Deleted: store.Delete(command.CredentialId)),
            _ => throw new CredentialStoreException("UNSUPPORTED_ACTION")
        };
    }
    catch (CredentialStoreException error)
    {
        response = new CredentialResponse(requestId, false, ErrorCode: error.Code);
    }
    catch (JsonException)
    {
        response = new CredentialResponse(requestId, false, ErrorCode: "INVALID_REQUEST");
    }
    catch
    {
        response = new CredentialResponse(requestId, false, ErrorCode: "CREDENTIAL_OPERATION_FAILED");
    }

    Console.WriteLine(JsonSerializer.Serialize(response, CredentialJsonContext.Default.CredentialResponse));
    Console.Out.Flush();
}
