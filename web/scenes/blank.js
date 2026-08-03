SG.register("blank", {
  defaults: { bg: null, grain: 0 },
  mount(ctx) {
    ctx.root.style.background = ctx.props.bg || ctx.theme.bg || "#000";
  },
  seek() {},
});
