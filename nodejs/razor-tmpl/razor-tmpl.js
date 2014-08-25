﻿/*
 * Created BY Magicdawn;
 */
String.prototype.razorReplaceAll = function(oldValue, replaceValue) {
    return this.replace(new RegExp(oldValue, 'g'), replaceValue);
};
String.prototype.razorReplaceAll._doc = 'str.razorReplaceAll(old,new),use new RegExp(old,g)';

String.prototype.razorFormat = function(obj0, obj1, obj2) {
    var result = this;
    for (var i in arguments) {
        //将{0} -> obj[0]
        //new RegExp("\\{ 0 \\\}",g)
        result = result.razorReplaceAll("\\{" + i + "\\}", arguments[i].toString());
    }
    return result;
};
String.prototype.razorFormat._doc = 'str.razorFormat(obj0, obj1, obj2) , no obj count limit';

(function(_export) {
    //Object.prototype._doc = "_doc property display usage"
    var razor = {
        version: '1.0.0',
        update_date: '2014-8-17',
        debuging: false
    };

    //do export
    if (typeof module !== "undefined" && module.exports) { //nodejs
        module.exports = razor;
    }
    else if (typeof window !== 'undefined') { //browser
        window.razor = razor;
    }
    else { //no window,no global
        _export.razor = razor;
    }

    //简化模板

    function simpleMinfy(str, isJsCode) {
        //对模板简单的简化
        if (isJsCode) {
            //对codeBlock使用isJsCode = true
            str = str.replace(/\/\/.*$/gm, '') //单行注释
            .replace(/\/\*[\s\S]*\*\//g, ''); //多行注释,.号任意字符不包括\n,用[\s\S]表示任意字符
        }
        //普通的去除空行
        return str.replace(/@\*[\s\S]*?\*@]/g, '') //去除模板注释
        .replace(/\n+/g, '\n') //多个空行转为一个
        .replace(/ +/g, ' ') //对个空格转为一个
        .replace(/<!--[\s\S]*?-->/g, '')
            .trim();
    };

    function Segment(content, eSegmentType) {
        this.Content = content;
        this.SegmentType = eSegmentType;
        this.toString = function() {
            return this.Content;
        };
    }
    Segment._doc = "Segment constructor";

    function StringBlockModel(template) {
        this.template = template;
        this.processedIndex = -1;
        this.segments = [];
    }
    StringBlockModel._doc = "StringBlockModel constructor";

    //一个节点的类型
    var ESegmentType = {
        CodeBlock: 0,
        Variable: 1,
        String: 2
    };
    var Regexs = {
        //@each(item in items){}
        Each: /^each\s*?\([\s\S]+?\)\s*?\{[\s\S]*?\}/,

        //@...{}
        Noraml: /[\S\s]*?\{[\S\s]*?\}/
    };

    var SegmentProcesser = {
        symbol: '@',

        //Segment[] result = SegmentProcesser.process(String template);
        process: function(template) {
            var model = new StringBlockModel(template);
            SegmentProcesser.processStringBlock(model);
            return model.segments;
        },

        //StringBlock,主循环
        processStringBlock: function(model) {
            var template = model.template;
            for (var index = 0, length = template.length; index < length; index++) {
                var current = template[index];
                var next = '';
                if (current == this.symbol) //当前为'@'
                {
                    //1. @之前的string
                    this.processString(model, index);

                    //2. @之后的判断,不允许空白
                    //@@ escape
                    //@* *@注释
                    next = template[index + 1];
                    //@@
                    if (next == this.symbol) {
                        index = this.processEscapeSymbol(model, index);
                        continue;
                    }
                    //@* comment *@
                    else if (next == "*") {
                        index = this.processComment(model, index);
                        continue;
                    }
                    else {
                        var tokenIndex = index + 1;
                        //其他允许有空白
                        //@ if ( name == 'zhangsan' )
                        //{
                        //  ...
                        //}
                        while (next == ' ' || next == '\n') {
                            //继续
                            next = template[++tokenIndex];
                            //@ if() -> tokenIndex=index+2
                        }

                        switch (next) {
                            case '{': //@{code block}
                                index = this.processCodeBlock(model, index, tokenIndex);
                                break;
                            case '(': //@(var)
                                index = this.processVariable(model, index, tokenIndex);
                                break;
                            default: //可能有@if @for @while等
                                var remain = model.template.substring(tokenIndex);
                                //each - for/while/if/else - 普通 @...{}
                                if (Regexs.Each.test(remain)) {
                                    //@each
                                    index = this.processEach(model, index, tokenIndex);
                                }
                                else if (Regexs.Noraml.test(remain)) {
                                    //@...{}
                                    index = this.processNormal(model, index, tokenIndex);
                                }
                                break;
                        }
                    }
                }
            }
            //for退出后,还有一段string
            //processString取 [processedIndex+1,atIndex)就是atIndex前面一个
            //(template.length-1)+1 如length=10,0-9,9+1,包括9
            this.processString(model, model.template.length);
        },

        /*
         processXXX(model,index)
         index为@的位置

         应该更新model的processedIndex
         并返回新的index应该位置
         */
        //普通String,如 <div>@(var变量)中的<div>

        //@之后无空白
        processString: function(model, atIndex) {
            var content = model.template.substring(model.processedIndex + 1, atIndex);

            if (content.trim()) //不是全空白
            {
                model.segments.push(new Segment(content, ESegmentType.String));
            }
            model.processedIndex = atIndex - 1;
        },
        processComment: function(model, atIndex) {
            // @* comment *@
            var remain = model.template.substring(atIndex);
            var xingIndex = remain.indexOf('*' + this.symbol);
            if (xingIndex > -1) {
                //存在*@
                var commentEnd = xingIndex + atIndex + 1;
                model.processedIndex = commentEnd;
                return commentEnd;
            }
            else {
                //只有@* 没有 *@
                //throw new Error("no comment-end(*@) found");
                return atIndex + 1;
            }
        },
        processEscapeSymbol: function(model, atIndex) {
            //@@ index index+1
            model.segments.push(new Segment(this.symbol, ESegmentType.String));
            model.processedIndex = atIndex + 1;

            //index指向block最后
            return model.processedIndex;
        },

        //@之后可能有空白
        processCodeBlock: function(model, atIndex, firstBraceIndex) {
            //@ { }
            //index -> '@'
            //firstBraceIndex -> '{'
            var secondBraceIndex = this.getSecondIndex(model.template, firstBraceIndex);
            var content = model.template.substring(firstBraceIndex + 1, secondBraceIndex);
            if (content) {
                //将 &amp; 转化为&
                content = this.decodeHtmlEntity(content);
                model.segments.push(new Segment(content, ESegmentType.CodeBlock));
            }
            return model.processedIndex = secondBraceIndex;
        },
        processVariable: function(model, atIndex, firstBraceIndex) {
            //@(data) or @(- data)
            //使用@(- data)来escape,如data="<div>abc</div>"   --> &lt;div&gt;abc
            var secondBraceIndex = this.getSecondIndex(model.template, firstBraceIndex);
            var content = model.template.substring(atIndex + 2, secondBraceIndex).trim();
            if (content) {
                content = this.decodeHtmlEntity(content); //像@( p.age &gt;= 10)

                /*
                 * @(-= name) -=混用,不论顺序
                 */
                var fi = content[0];
                var sec = content[1];
                var no_viewbag = 0;
                var escape = 0;

                //@(-= name)
                if (fi === '=' || sec === '=') {
                    no_viewbag = 1;
                }
                if (fi === '-' || sec === '-') {
                    escape = 1;
                }

                content = content.substring(no_viewbag + escape).trim();

                if (no_viewbag) {
                    content = SegmentCompiler.modelName + "." + content;
                }
                if (escape) {
                    //escape 86, non escape 8451
                    //content += ".encodeHtml()"; //速度太慢,不能接受

                    //@(- data) data="&1"
                    content += ".replace(/&/g,'&amp;')";
                    content += ".replace(/</g,'&lt;')";
                    content += ".replace(/>/g,'&gt;')";
                    content += ".replace(/'/g,'&#39;')";
                    content += '.replace(/"/g,"&#34;")';
                    content += ".replace(/\\//g,'&#47;')";
                }

                //@(data)
                model.segments.push(new Segment(content, ESegmentType.Variable));
            }
            return model.processedIndex = secondBraceIndex;
        },

        processEach: function(model, atIndex, firstLetterIndex) {
            //@ each(item in items) {
            //  <div>@(item)</div>
            //}
            //atIndex -> '@'
            //firstLetterIndex -> 'e' , each's first letter

            // '(' ')'
            var remain = model.template.substring(atIndex); //@xxxxx
            var firstBraceIndex = remain.indexOf('(') + atIndex;
            var secondBraceIndex = this.getSecondIndex(
                model.template, firstBraceIndex);

            //'{' '}'
            var firstBigIndex = remain.indexOf('{') + atIndex;
            var secondBigIndex = this.getSecondIndex(model.template, firstBigIndex);

            //1.for(var i in items){ item = items[i];
            //item in items
            var loop = model.template.substring(firstBraceIndex + 1, secondBraceIndex);
            var inIndex = loop.indexOf('in');
            var item = loop.substring(0, inIndex).trim()
            var items = loop.substring(inIndex + 2).trim();

            //循环体
            var loopCode = "for(var $index = 0,$length = {1}.length;$index < $length;$index++) { var {0} = {1}[$index];".razorFormat(item, items);
            model.segments.push(new Segment(loopCode, ESegmentType.CodeBlock));

            //2.循环体
            //{ <div>@(data)</div> }
            var loopContent = model.template.substring(firstBigIndex + 1, secondBigIndex);
            var innerSegments = this.process(loopContent);
            model.segments = model.segments.concat(innerSegments);

            //3.}
            model.segments.push(new Segment('}', ESegmentType.CodeBlock));

            //更新processedIndex 返回index 该有的位置
            return model.processedIndex = secondBigIndex;
        },
        processNormal: function(model, atIndex, firstLetterIndex) {
            //@...{     for/while/if/else/try/catch/switch/case
            //  <div><>
            //}
            //atIndex -> '@'
            //firstLetterIndex -> @之后第一个非空白字符

            var remain = model.template.substring(atIndex);
            var firstIndex = remain.indexOf('{') + atIndex;
            //在model.template里找匹配的'}'
            var secondIndex = this.getSecondIndex(model.template, firstIndex);

            var part1 = model.template.substring(firstLetterIndex, firstIndex + 1); //for(xxx){
            var part2 = model.template.substring(firstIndex + 1, secondIndex); //  <div>@(data)</div>
            var part3 = '}'; //}

            //1.part1
            part1 = this.decodeHtmlEntity(part1);
            model.segments.push(new Segment(part1, ESegmentType.CodeBlock));

            //2.part2
            //part2为StringBlock,意味着if while for 可以 嵌套
            var subSegments = this.process(part2);
            model.segments = model.segments.concat(subSegments);

            //3.part3
            model.segments.push(new Segment(part3, ESegmentType.CodeBlock));

            //更新processedIndex和返回index
            return model.processedIndex = secondIndex;
        },

        getSecondIndex: function(template, firstIndex) {
            //index 是第一个{的Index
            var pair = {
                '{': '}',
                '(': ')'
            };

            var first = template.substr(firstIndex, 1); //'{' or '('
            var second = pair[first];
            var count = 1; //firstIndex处是first

            for (var index = firstIndex + 1, length = template.length; index < length; index++) {
                var cur = template.substr(index, 1);
                if (cur == second) {
                    count--;
                    if (count == 0) {
                        break;
                    }
                }
                else if (cur == first) {
                    count++;
                }
            }
            return index;
        },
        //在浏览器中,html()等方法会将特殊字符encode,导致处理之前是@while(a &gt; 10) { }
        //http://www.w3school.com.cn/html/html_entities.asp
        //'&lt;'    ---->    <
        //'&gt;'    ---->    >
        //'&amp;'   ---->    &
        decodeHtmlEntity: function(variable) {
            return variable.razorReplaceAll('&lt;', '<')
                .razorReplaceAll('&gt;', '>')
                .razorReplaceAll('&amp;', '&');
        }
    };

    var SegmentCompiler = {
        modelName: "ViewBag",

        //将 ' => \'
        //将 " => \"
        //将 回车 => \n
        //usage : "xxx".escapeInFunction();
        escapeInFunction: function(str) {
            if (!str) return str;
            return str
                .replace(/'/g, "\\'")
                .replace(/"/g, '\\"')
                .replace(/(\r?\n)/g, "\\n");

            //一个string包含"abcd\nabcd"
            //写到function也就是
            //$result += "abcd
            // abcd";
            //导致new function出错
        },

        compileToCode: function(segments) {
            var code = ["var $result='';"]; // $result 结果
            try {
                for (var i in segments) {
                    var data = segments[i].Content;
                    switch (segments[i].SegmentType) {
                        case ESegmentType.CodeBlock:
                            //@{ var data=10; }
                            code.push(data);
                            break;
                        case ESegmentType.Variable:
                            //不允许空值,就是值不存在的情况下会报错
                            //@(data)
                            //result.push(data);
                            var inner = "$result+={0};".razorFormat(data);
                            code.push(inner);
                            break;
                        case ESegmentType.String:
                            //div
                            //result+='div';
                            // "div"
                            //result+='\"div\"';
                            var inner = "$result+='{0}';".razorFormat(
                                SegmentCompiler.escapeInFunction(data)
                                //将String直接量中的 ' " 屏蔽
                            );
                            code.push(inner);
                            break;
                        default:
                            break;
                    }
                }
                code.push("return $result;"); //return $result;
                return code.join('\n');
            }
            catch (e) {
                //包含不能识别的变量
                console.log("template contains undefined variable,please check template & data !");
                if (razor.debuging) { //debuging show err & code

                    console.log("----- compiled code start -----");
                    console.log(code.join('\n'));
                    console.log("----- compiled code  end  -----");
                    console.log();

                    console.log("----- error start -----");
                    throw e;
                }
                else {
                    return "return '';";
                }
            }
        },

        //var func=SegmentCompiler.compile(Segment[] segmnets)
        compile: function(segments) {
            var code = SegmentCompiler.compileToCode(segments);
            try {
                return new Function(SegmentCompiler.modelName, code);
            }
            catch (e) {
                //new Function出错
                console.log("error when call 'new Function',please check template & data !");
                if (razor.debuging) { //debuging show err & code

                    console.log("----- compiled code start -----");
                    console.log(code);
                    console.log("----- compiled code  end  -----");
                    console.log();

                    console.log("----- error start -----");
                    throw e;
                }
                else {
                    return function() {
                        return '';
                    }
                }
            }
        }
    };

    razor.compile = function(template) {
        var segments = SegmentProcesser.process(template);
        var func = SegmentCompiler.compile(segments);
        return func;
    };
    razor.compile._doc = "function func = razor.compile(template)";

    //String result=razor.render(String template,Object ViewBag)
    razor.render = function(template, ViewBag) {
        if (!this.withViewBag) {
            var codeDef = "";
            for (var key in ViewBag) {
                codeDef += "var {0} = ViewBag['{0}'];".razorFormat(key);
            }
            template = "@{" + codeDef + "}" + template;
        }

        var func = this.compile(template);
        return func(ViewBag);
    };
    razor.render._doc = "String result = razor.render(String template,Object ViewBag)";

    //自定义相关
    razor.withViewBag = true;
    razor.symbol = function(newSymbol) {
        // get
        if (!newSymbol) return SegmentProcesser.symbol;

        // set
        SegmentProcesser.symbol = newSymbol;
        return this;
    };
    razor.symbol._doc = "\n\
        get or set the char as the symbol\n\
        get : razor.symbol() default = '@'\n\
        set : razor.symbol(newSymbol)\n\
    ";

    razor.model = function(newModelName) {
        // get
        if (!newModelName) return SegmentCompiler.modelName;

        //2 set
        SegmentCompiler.modelName = newModelName;
        return this;
    };
    razor.model._doc = "\n\
        get or set the data object used in the view\n\
        get : razor.model() default = 'ViewBag'\n\
        set : razor.model(newModelName)\n\
    ";

    razor.init = function() {
        this.withViewBag = true;
        return this.symbol('@').model('ViewBag');
    };
    razor.init._doc = "\n\
        you can custom by\n\
            razor.symbol        default = '@'\n\
            razor.model         default = ViewBag\n\
            razor.withViewBag   default = false,that means you need @(ViewBag.somevar)\n\
        \n\
        and this method is to change back to the default value.\n\
    ";

    //工具
    razor.encodeHtml = function(str) {
        //在@(- data)不用这个因为速度太慢
        //content += ".replace(/&/g,'&amp;')";
        //content += ".replace(/</g,'&lt;')";
        //content += ".replace(/>/g,'&gt;')";
        //content += ".replace(/'/g,'&#39;')";
        //content += '.replace(/"/g,"&#34;")';
        //content += ".replace(/\\//g,'&#47;')";
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/'/g, '&#39;')
            .replace(/"/g, "&#34;")
            .replace(/\//g, '&#47;');
    };
    razor.encodeHtml._doc = "encode html entity";

    razor.decodeHtml = function(str) {
        return SegmentProcesser.decodeHtmlEntity(str);
    };
    razor.decodeHtml._doc = "decode html entity";

    //高级选项
    razor._advance = {
        toSegments: SegmentProcesser.process, //process(string)->[]
        toCode: SegmentCompiler.compileToCode //compileToCode([])->string_as_code
    };
    razor._advance.toSegments._doc = "Segment[] segments = toSegments(template)";
    razor._advance.toCode._doc = "String code = toCode(Segment[] segments)";


    //if jQuery exists
    //---------------------------------------
    if (typeof jQuery !== 'undefined' && jQuery) {
        var $ = jQuery;
        //隐藏所有的razor-template div
        $(function() {
            $("[razor-template]").hide();
        });

        //"for(var xxx=xxx){" = getLoopHeader(jqObj)

        function getLoopHeader(jqObj) {
            var attr = jqObj.attr("razor-for") || jqObj.attr("data-razor-for");
            if (attr) {
                return 'for({0}){'.razorFormat(attr.trim());
            }
            attr = jqObj.attr("razor-if") || jqObj.attr("data-razor-if");
            if (attr) {
                return 'if({0}){'.razorFormat(attr.trim());
            }

            attr = jqObj.attr("razor-while") || jqObj.attr("data-razor-while");
            if (attr) {
                return 'while({0}){'.razorFormat(attr.trim());
            }

            attr = jqObj.attr("razor-each") || jqObj.attr("data-razor-each");
            if (attr) {
                return "each({0}){".razorFormat(attr);
            }

            //啥都不是
            return '';
        };

        function getTemplate(jqObj) {
            //div 的 innerHTML 已经不是模板
            var template = jqObj[0].tagName === "SCRIPT" ? jqObj.html() //script标签直接取html()
            : jqObj.attr("razor-template") || jqObj.html(); //div标签,先取razor-template属性

            //razor-for/while/if
            //razor-each
            // script | div 均可有这些属性
            var loopHeader = getLoopHeader(jqObj);
            if (loopHeader) {
                //@ + for(){ + xxx + }
                template = SegmentProcesser.symbol + loopHeader + template + '}';
            }
            return template;
        };

        $.fn.extend({
            //------------------------------------------
            //  render 表示处理节点的innerHtml
            //------------------------------------------
            //var func = $(selector).compile();
            compile: function() {
                return razor.compile(getTemplate(this));
            },

            //-----------------------------------------
            //  String html=$("#id").render(ViewBag)
            //  如果是script -> string
            //  如果是div ->html(render结果) & show
            //-----------------------------------------
            render: function(ViewBag) {
                var template = getTemplate(this);
                var result = razor.render(template, ViewBag);

                if (this[0].tagName !== "SCRIPT") {
                    //1.save razor-template
                    if (!this.attr("razor-template")) {
                        //只在第一次render的时候保存
                        var innerTemplate = this.html().trim();
                        this.attr("razor-template", innerTemplate);
                    }
                    //2.append result
                    this.html(result);
                    //3.make it show
                    this.show();
                }

                return result;
            },

            //render到节点的parent
            //$("#template-id").renderToParent(ViewBag)
            renderToParent: function(ViewBag) {
                var html = this.render(ViewBag);
                this.parent().append(html);
                return html;
            }
        });

        $.fn.compile._doc = "var func = $(selector).compile()";
        $.fn.render._doc = "result = $(selector).render(ViewBag) , for div[data-razor-tmpl] or SCRIPT[type='template']";
        $.fn.renderToParent._doc = "$(selector).renderToParent() , it use the jqObj.parent() to find parent,and append result";
    }
})(this);