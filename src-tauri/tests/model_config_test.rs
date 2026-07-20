use xai_grok_shell::util::config::load_effective_config;

#[test]
fn glm5_is_configured_as_default() {
    let raw = load_effective_config().expect("load_effective_config");
    let models_default = raw
        .get("models")
        .and_then(|m| m.get("default"))
        .and_then(|d| d.as_str());
    println!("[models] default = {:?}", models_default);
    assert_eq!(models_default, Some("glm-5"));

    let glm5 = raw.get("model").and_then(|m| m.get("glm-5"));
    println!("[model.glm-5] present = {}", glm5.is_some());
    if let Some(entry) = glm5 {
        println!("[model.glm-5] fields: {:?}", entry);
    }
}
